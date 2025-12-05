const userInxput = "5+2";

// Semgrep will flag this: eval with dynamic input
const result = eval(userInxput);

console.log("Result is now:", result);
