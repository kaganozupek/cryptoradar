/**
 * Created by coskudemirhan on 22/07/2017.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const routePath = path.join(__dirname);

fs.readdirSync(routePath).forEach((file) => {
    if (file !== "index.js") {
        module.exports[file.replace(".js", "")] = require("./" + file);
    }
});