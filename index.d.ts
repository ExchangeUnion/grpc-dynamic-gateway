import importedGrpc from 'grpc';
import express from 'express';
/**
 * generate middleware to proxy to gRPC defined by proto files
 * @param protoFiles Filenames of protobuf-file
 * @param grpcLocation HOST:PORT of gRPC server
 * @param credentials credential context (default: grpc.credentials.createInsecure())
 * @param include  Path to find all includes
 * @return Middleware
 */
declare const middleware: (protoFiles: string[], grpcLocation: string, credentials?: importedGrpc.ServerCredentials, include?: string) => import("express-serve-static-core").Router;
/**
 * Parse express request params & query into params for grpc client
 * @param req Express request object
 * @param url  gRPC url field (ie "/v1/hi/{name}")
 * @return params for gRPC client
 */
declare const convertParams: (req: express.Request, url: string) => any;
/**
 * Convert gRPC URL expression into express
 * @param url gRPC URL expression
 * @return  express URL expression
 */
declare const convertUrl: (url: string) => string;
/**
 * Convert gRPC response to output, based on gRPC body field
 * @param value   gRPC response object
 * @param bodyMap gRPC body field
 * @return mapped output for `res.send()`
 */
declare const convertBody: (value: any, bodyMap: string) => any;
/**
 * Get a list of params from a gRPC URL
 * @param url gRPC URL
 * @return   Array of params
 */
declare const getParamsList: (url: string) => any;
/**
 * Convert headers into gRPC meta
 * @param  headers Headers: {name: value}
 * @return grpc meta object
 */
declare const convertHeaders: (headers?: any, grpc?: typeof importedGrpc) => any;
export default middleware;
export { convertParams, convertUrl, convertBody, getParamsList, convertHeaders, };
