#!/usr/bin/env node
//  findaplace
//  Author:  Monong Yang, Qingshan Zhang, Jinhao Zhong, Anthony Xie
//  Description:  Find a place to meet in London.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { search } from "./backend.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, "../front-end");

const app = express();
app.use(express.json());               // parses the JSON body of the POST
app.use(express.static(FRONTEND));     // serves index.html, css/, js/

app.post("/api/search", async (req, res) => {
  try {
    res.json(await search(req.body));
  } catch (err) {
    console.error(err);
    // AppError carries .status (400/404/422/502/504); anything else is a 500
    res.status(err.status || 500).json({
      error: err.status ? err.message : "Something went wrong on the server"
    });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`findaplace at http://localhost:${port}`));
