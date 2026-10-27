#!/usr/bin/env node

//  findaplace
//  Author:  Monong Yang, Qingshan Zhang, Jinhao Zhong, Anthony Xie
//  Description:  Find a place to meet in London.
//  Version: 2.0
//
//  Notes:   Any notes we need to know about the server     

//  Install Instructions
//      npm install moment mysql express ejs ....  
//         OR Groups will get more credit if they use
//      npm install and npm start shortcuts and include a package.json file
//          - See https://docs.npmjs.com/creating-a-package-json-file


"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../front-end");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Method not allowed");
      return;
    }

    let requestPath;
    try {
      requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    const relative = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.resolve(ROOT, "." + relative);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Length": data.length,
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      res.writeHead(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500);
      res.end(error.code === "ENOENT" || error.code === "ENOTDIR" ? "Not found" : "Server error");
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`findaplace at http://localhost:${port}`);
  });
}

module.exports = { createServer };
