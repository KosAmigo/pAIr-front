
# Development Rules

## Backend
- Use Java 21 and Spring Boot.
- Follow layered architecture.
- Separate Controller, Service, Repository.
- Use DTOs for API requests and responses.
- Apply transaction boundaries appropriately.
- Check N+1 queries and SQL performance.

## Frontend
- Use React and TypeScript.
- Keep components small and reusable.
- Separate API calls from UI components.
- Handle loading and error states.

## Testing
- Write tests for important business logic.
- Run relevant tests after modifications.
- Run build before completing tasks.

## Token Efficiency
- Inspect only files relevant to the task.
- Avoid reading the entire project repeatedly.
- Do not invoke agents unless necessary.
- Do not generate unnecessary documentation.
- Summarize changed files and test results briefly.
- Ask before large-scale refactoring.
