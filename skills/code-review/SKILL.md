---
name: Code Review
description: This skill should be used when the user asks to "review code", "代码审查", "检查代码质量", "review this code", "代码评审"
version: 1.0.0
author: Claude Agent Team
tags:
  - code-quality
  - review
  - best-practices
---

# Code Review Skill

## Purpose

Provide comprehensive code review with focus on:
- Code quality and readability
- Best practices adherence
- Potential bugs and issues
- Performance considerations
- Security vulnerabilities

## Process

1. **Understand Context**
   - Identify the programming language and framework
   - Understand the purpose of the code
   - Note any specific requirements or constraints

2. **Analyze Code Structure**
   - Review overall architecture and design patterns
   - Check code organization and modularity
   - Evaluate naming conventions and readability

3. **Quality Checks**
   - Look for potential bugs and edge cases
   - Check error handling completeness
   - Review resource management (memory, connections, etc.)
   - Identify code duplication

4. **Security Review**
   - Check for common vulnerabilities (OWASP Top 10)
   - Review input validation
   - Check authentication and authorization patterns
   - Look for sensitive data exposure risks

5. **Performance Considerations**
   - Identify potential bottlenecks
   - Review algorithm efficiency
   - Check for unnecessary operations
   - Evaluate caching opportunities

6. **Provide Feedback**
   - Summarize findings with severity levels
   - Provide specific, actionable recommendations
   - Include code examples for improvements
   - Prioritize issues by impact

## Output Format

```markdown
## Code Review Summary

### Critical Issues 🔴
- [List critical issues that must be fixed]

### Warnings 🟡
- [List warnings that should be addressed]

### Suggestions 🟢
- [List optional improvements]

### Positive Aspects ✅
- [Highlight good practices found]

### Detailed Analysis
[Detailed explanations for each issue]
```

## Best Practices Reference

- Follow language-specific style guides
- Consider SOLID principles
- Apply DRY (Don't Repeat Yourself)
- Ensure proper documentation
- Write testable code
