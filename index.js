"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const grpc_1 = __importDefault(require("grpc"));
const express_1 = __importDefault(require("express"));
const chalk_1 = __importDefault(require("chalk"));
const fs_1 = __importDefault(require("fs"));
const protocol_buffers_schema_1 = __importDefault(require("protocol-buffers-schema"));
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
const middleware = (protoFiles, grpcLocation, credentials = grpc_1.default.credentials.createInsecure(), include) => {
    const router = express_1.default.Router();
    const clients = {};
    const protos = protoFiles.map(p => include ? grpc_1.default.load({ file: p, root: include }) : grpc_1.default.load(p));
    protoFiles
        .map(p => `${include}/${p}`)
        .map(p => protocol_buffers_schema_1.default.parse(fs_1.default.readFileSync(p)))
        .forEach((sch, si) => {
        const pkg = sch.package;
        if (!sch.services) {
            return;
        }
        sch.services.forEach((s) => {
            const svc = s.name;
            const svcarr = getPkg(clients, pkg, true);
            svcarr[svc] = new (getPkg(protos[si], pkg, false))[svc](grpcLocation, credentials);
            s.methods.forEach((m) => {
                if (m.options['google.api.http']) {
                    supportedMethods.forEach((httpMethod) => {
                        if (m.options['google.api.http'][httpMethod]) {
                            console.log(chalk_1.default.green(httpMethod.toUpperCase()), chalk_1.default.blue(m.options['google.api.http'][httpMethod]));
                            router[httpMethod](convertUrl(m.options['google.api.http'][httpMethod]), (req, res) => {
                                const params = convertParams(req, m.options['google.api.http'][httpMethod]);
                                const meta = convertHeaders(req.headers, grpc_1.default);
                                const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                                try {
                                    getPkg(clients, pkg, false)[svc][lowerFirstChar(m.name)](params, meta, (err, ans) => {
                                        // TODO: PRIORITY:MEDIUM - improve error-handling
                                        // TODO: PRIORITY:HIGH - double-check JSON mapping is identical to grpc-gateway
                                        if (err) {
                                            console.error(chalk_1.default.red(`${svc}.${m.name}`, err.message));
                                            console.trace();
                                            return res.status(500).json({ code: err.code, message: err.message });
                                        }
                                        res.json(convertBody(ans, m.options['google.api.http'].body));
                                    });
                                }
                                catch (err) {
                                    console.error(chalk_1.default.red(`${svc}.${m.name}: `, err.message));
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
const getPkg = (client, pkg, create = false) => {
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
const convertParams = (req, url) => {
    const gparams = getParamsList(url);
    const out = req.body;
    gparams.forEach((p) => {
        if (req.query && req.query[p]) {
            out[p] = req.query[p];
        }
        if (req.params && req.params[p]) {
            out[p] = req.params[p];
        }
    });
    return out;
};
exports.convertParams = convertParams;
/**
 * Convert gRPC URL expression into express
 * @param url gRPC URL expression
 * @return  express URL expression
 */
const convertUrl = (url) => {
    // TODO: PRIORITY:LOW - use types to generate regex for numbers & strings in params
    return url.replace(paramRegex, ':$1');
};
exports.convertUrl = convertUrl;
/**
 * Convert gRPC response to output, based on gRPC body field
 * @param value   gRPC response object
 * @param bodyMap gRPC body field
 * @return mapped output for `res.send()`
 */
const convertBody = (value, bodyMap) => {
    const respBodyMap = bodyMap || '*';
    if (respBodyMap === '*') {
        return value;
    }
    else {
        return value[respBodyMap];
    }
};
exports.convertBody = convertBody;
/**
 * Get a list of params from a gRPC URL
 * @param url gRPC URL
 * @return   Array of params
 */
const getParamsList = (url) => {
    const out = [];
    let m;
    while ((m = paramRegex.exec(url)) !== null) {
        if (m.index === paramRegex.lastIndex) {
            paramRegex.lastIndex += 1;
        }
        out.push(m[1]);
    }
    return out;
};
exports.getParamsList = getParamsList;
/**
 * Convert headers into gRPC meta
 * @param  headers Headers: {name: value}
 * @return grpc meta object
 */
const convertHeaders = (headers, grpc = grpc_1.default) => {
    const grpcheaders = headers || {};
    const metadata = new grpc.Metadata();
    Object.keys(grpcheaders).forEach((h) => { metadata.set(h, grpcheaders[h]); });
    return metadata;
};
exports.convertHeaders = convertHeaders;
exports.default = middleware;
//# sourceMappingURL=index.js.map