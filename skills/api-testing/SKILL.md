---
name: API Testing
description: This skill should be used when the user asks to "test API", "测试接口", "API 测试", "test endpoint", "接口测试", "验证 API"
version: 1.0.0
author: Claude Agent Team
tags:
  - api
  - testing
  - http
  - rest
---

# API Testing Skill

## Purpose

Comprehensive API testing assistance including:
- Endpoint validation
- Request/response verification
- Authentication testing
- Performance testing guidance
- Documentation generation

## Process

1. **Understand API Context**
   - Identify API type (REST, GraphQL, gRPC)
   - Understand authentication mechanism
   - Note base URL and environment
   - Identify required headers and parameters

2. **Test Planning**
   - List endpoints to test
   - Define test scenarios (happy path, edge cases, error cases)
   - Prepare test data
   - Set up authentication

3. **Execute Tests**
   - Test basic connectivity
   - Validate request formats
   - Verify response structures
   - Check status codes and error handling
   - Test authentication and authorization

4. **Validation Checks**
   - Response schema validation
   - Data integrity checks
   - Performance benchmarks
   - Security headers verification

5. **Report Results**
   - Summarize test outcomes
   - List any issues found
   - Provide recommendations
   - Suggest improvements

## Common Test Patterns

### REST API Testing

```bash
# Basic GET request
curl -X GET "https://api.example.com/users" \
  -H "Authorization: Bearer <token>"

# POST with JSON body
curl -X POST "https://api.example.com/users" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "John", "email": "john@example.com"}'

# PUT update
curl -X PUT "https://api.example.com/users/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Updated"}'

# DELETE
curl -X DELETE "https://api.example.com/users/1"
```

### Test Checklist

- [ ] All endpoints return correct status codes
- [ ] Response format matches API specification
- [ ] Authentication works correctly
- [ ] Authorization prevents unauthorized access
- [ ] Rate limiting functions properly
- [ ] Error messages are informative
- [ ] Response times are acceptable
- [ ] Pagination works correctly
- [ ] Filtering and sorting work as expected
- [ ] Concurrent requests are handled properly

## Output Format

```markdown
## API Test Report

### Test Environment
- Base URL: [URL]
- Authentication: [Method]
- Date: [Timestamp]

### Test Results Summary
| Endpoint | Method | Status | Result |
|----------|--------|--------|--------|
| /users   | GET    | 200    | ✅ Pass |
| /users   | POST   | 201    | ✅ Pass |

### Issues Found
- [List any issues]

### Recommendations
- [List recommendations]
```

## Best Practices

1. **Security**
   - Never expose API keys in logs
   - Use environment variables for secrets
   - Test with minimal required permissions

2. **Performance**
   - Set appropriate timeouts
   - Test with realistic data volumes
   - Consider rate limiting

3. **Reliability**
   - Test idempotency
   - Handle network failures gracefully
   - Validate all response fields
