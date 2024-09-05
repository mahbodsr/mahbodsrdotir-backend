"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = getPhoneCode;
function getPhoneCode(ev) {
    return () => {
        console.log("you should now enter phonecode.");
        return new Promise((resolve) => ev.on("phonecode", (code) => resolve(code)));
    };
}
