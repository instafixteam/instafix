const userInput = "2+2";

// Semgrep will flag this: eval with dynamic input
const result = eval(userInput);

console.log("Result is:", result);
