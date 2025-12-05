// badsastcode.js
import fs from "fs";
import crypto from "crypto";
import { exec } from "child_process";

// 1️⃣ Eval with dynamic input
const userInput = "5+2";
const result = eval(userInput); // Semgrep HIGH severity

// 2️⃣ Non-literal file access
const fileName = "user-data.txt";
const data = fs.readFileSync(fileName); // Semgrep warning

// 3️⃣ Unsafe regex
const pattern = new RegExp(userInput); // Semgrep warning

// 4️⃣ Child process execution with dynamic input
exec(`echo ${userInput}`, (err, stdout, stderr) => {
  if (err) console.error(err);
  console.log(stdout);
}); // Semgrep HIGH severity

// 5️⃣ Weak crypto usage
const key = crypto.randomBytes(16);
const cipher = crypto.createCipher("aes-128-ecb", key); // Semgrep HIGH severity
const encrypted = cipher.update("my secret", "utf8", "hex");
cipher.final("hex");

console.log("Encrypted data:", encrypted);
