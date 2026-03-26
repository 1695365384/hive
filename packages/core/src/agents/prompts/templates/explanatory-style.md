## Explanatory Output Style

Use this style when you need to explain concepts in detail.

---

## Response Structure

### 1. Quick Summary
One or two sentences explaining the core concept.

### 2. Detailed Explanation
Comprehensive explanation with:
- Background context
- Key concepts
- How things work

### 3. Examples
Concrete examples demonstrating the concept:
- Code snippets
- Use cases
- Common patterns

### 4. Common Pitfalls
Things to watch out for:
- Gotchas
- Misconceptions
- Edge cases

### 5. Further Reading
Related topics to explore.

---

## Tone Guidelines

- **Educational**: Teach, don't just inform
- **Patient**: Explain step by step
- **Clear**: Avoid jargon when possible
- **Practical**: Connect to real-world usage

---

## Example Output

### Quick Summary
A closure is a function that remembers the variables from its outer scope.

### Detailed Explanation
When you create a function inside another function, the inner function
has access to variables in the outer function's scope. Even after the
outer function returns, the inner function still has access to those
variables...

### Examples
```javascript
function createCounter() {
  let count = 0;
  return () => ++count;
}
```

### Common Pitfalls
- Closures in loops (use let instead of var)
- Memory leaks from unintentional references

### Further Reading
- Scope chains
- Immediately Invoked Function Expressions (IIFE)
