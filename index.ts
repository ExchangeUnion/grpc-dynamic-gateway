import importedGrpc from 'grpc';
import express from 'express';
import colors from 'chalk';
import fs from 'fs';
import schema from 'protocol-buffers-schema';

const supportedMethods = ['get', 'put', 'post', 'delete', 'patch']; // supported HTTP methods
const paramRegex = /{(\w+)}/g; // regex to find gRPC params in url

const lowerFirstChar = str => str.charAt(0).toLowerCase() + str.slice(1);

/**
 * generate middleware to proxy to gRPC defined by proto files
 * @param protoFiles Filenames of protobuf-file
 * @param grpcLocation HOST:PORT of gRPC server
 * @param credentials credential context (default: grpc.credentials.createInsecure())
 * @param include  Path to find all includes
 * @return Middleware
 */
const middleware = (protoFiles: string[], grpcLocation: string, credentials: importedGrpc.ServerCredentials = importedGrpc.credentials.createInsecure(), include?: string) => {
  const router = express.Router();
  const clients = {};
  const protos = protoFiles.map(p => include ? importedGrpc.load({ file: p, root: include }) : importedGrpc.load(p));
  protoFiles
    .map(p => `${include}/${p}`)
    .map(p => schema.parse(fs.readFileSync(p)))
    .forEach((sch, si) => {
      const pkg = sch.package;
      if (!sch.services) { return; }
      sch.services.forEach((s) => {
        const svc = s.name;
        const svcarr = getPkg(clients, pkg, true);
        svcarr[svc] = new (getPkg(protos[si], pkg, false))[svc](grpcLocation, credentials);
        s.methods.forEach((m) => {
          if (m.options['google.api.http']) {
            supportedMethods.forEach((httpMethod) => {
              if (m.options['google.api.http'][httpMethod]) {
                console.log(colors.green(httpMethod.toUpperCase()), colors.blue(m.options['google.api.http'][httpMethod]));
                router[httpMethod](convertUrl(m.options['google.api.http'][httpMethod]), (req, res) => {
                  const params = convertParams(req, m.options['google.api.http'][httpMethod]);
                  const meta = convertHeaders(req.headers, importedGrpc);
                  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                  try {
                    getPkg(clients, pkg, false)[svc][lowerFirstChar(m.name)](params, meta, (err, ans) => {
                      // TODO: PRIORITY:MEDIUM - improve error-handling
                      // TODO: PRIORITY:HIGH - double-check JSON mapping is identical to grpc-gateway
                      if (err) {
                        console.error(colors.red(`${svc}.${m.name}`, err.message));
                        console.trace();
                        return res.status(500).json({ code: err.code, message: err.message });
                      }
                      res.json(convertBody(ans, m.options['google.api.http'].body));
                    });
                  } catch (err) {
                    console.error(colors.red(`${svc}.${m.name}: `, err.message));
                    console.trace();
                  }
                });
              }
            });
          }
        });
      });
    });
  return router;
};

const getPkg = (client: any, pkg: any, create: boolean = false): Object => {
  const ls = pkg.split('.');
  let obj = client;
  ls.forEach((name) => {
    if (create) {
      obj[name] = obj[name] || {};
    }
    obj = obj[name];
  });
  return obj;
};

/**
 * Parse express request params & query into params for grpc client
 * @param req Express request object
 * @param url  gRPC url field (ie "/v1/hi/{name}")
 * @return params for gRPC client
 */
const convertParams = (req: express.Request, url: string): any => {
  const gparams = getParamsList(url);
  const out = req.body;
  gparams.forEach((p: any) => {
    if (req.query && req.query[p]) {
      out[p] = req.query[p];
    }
    if (req.params && req.params[p]) {
      out[p] = req.params[p];
    }
  });
  return out;
};

/**
 * Convert gRPC URL expression into express
 * @param url gRPC URL expression
 * @return  express URL expression
 */
const convertUrl = (url: string): string => {
  // TODO: PRIORITY:LOW - use types to generate regex for numbers & strings in params
  return url.replace(paramRegex, ':$1');
};

/**
 * Convert gRPC response to output, based on gRPC body field
 * @param value   gRPC response object
 * @param bodyMap gRPC body field
 * @return mapped output for `res.send()`
 */
const convertBody = (value: any, bodyMap: string): any => {
  const respBodyMap = bodyMap || '*';
  if (respBodyMap === '*') {
    return value;
  } else {
    return value[respBodyMap];
  }
};

/**
 * Get a list of params from a gRPC URL
 * @param url gRPC URL
 * @return   Array of params
 */
const getParamsList = (url: string): any => {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(url)) !== null) {
    if (m.index === paramRegex.lastIndex) {
      paramRegex.lastIndex += 1;
    }
    out.push(m[1]);
  }
  return out;
};

/**
 * Convert headers into gRPC meta
 * @param  headers Headers: {name: value}
 * @return grpc meta object
 */
const convertHeaders = (headers?: any, grpc = importedGrpc): any => {
  const grpcheaders = headers || {};
  const metadata = new grpc.Metadata();
  Object.keys(grpcheaders).forEach((h) => { metadata.set(h, grpcheaders[h]); });
  return metadata;
};

export default middleware;
export {
  convertParams,
  convertUrl,
  convertBody,
  getParamsList,
  convertHeaders,
};
