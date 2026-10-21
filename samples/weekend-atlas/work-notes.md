# Weekend Atlas — session notes

Goal: Make destination search feel fast without showing stale results.
Completed: Connected the search input and destination cards to the API.
Completed: Added loading and empty states.
Blocked: Typing Lisbon quickly sometimes shows results for Lis.
Tried: A 300 ms debounce reduced requests but did not stop older responses replacing newer results.
Next idea: Track the latest request ID and ignore responses from previous requests.
Open question: Should we also cancel old requests to reduce network work?
