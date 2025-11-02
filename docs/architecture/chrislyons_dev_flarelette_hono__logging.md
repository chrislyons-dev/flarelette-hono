# logging — Code View

[← Back to Container](./chrislyons_dev_flarelette_hono.md) | [← Back to System](./README.md)

---

## Component Information

<table>
<tbody>
<tr>
<td><strong>Component</strong></td>
<td>logging</td>
</tr>
<tr>
<td><strong>Container</strong></td>
<td>@chrislyons-dev/flarelette-hono</td>
</tr>
<tr>
<td><strong>Type</strong></td>
<td><code>module</code></td>
</tr>
<tr>
<td><strong>Description</strong></td>
<td>Structured logging for Hono applications

Provides ADR-0013 compliant structured logging using hono-pino.
This is a thin wrapper that configures pino with the correct schema
for polyglot microservice consistency.</td>
</tr>
</tbody>
</table>

---

## Code Structure

### Class Diagram

![Class Diagram](./diagrams/structurizr-Classes_chrislyons_dev_flarelette_hono__logging.png)

### Code Elements

<details>
<summary><strong>4 code element(s)</strong></summary>



#### Functions

##### `formatLevel()`

Format log level as string (ADR-0013 requirement)

Pino formats levels as numbers by default, but ADR-0013 requires string levels.

<table>
<tbody>
<tr>
<td><strong>Type</strong></td>
<td><code>function</code></td>
</tr>
<tr>
<td><strong>Visibility</strong></td>
<td><code>public</code></td>
</tr>
<tr>
<td><strong>Returns</strong></td>
<td><code>{ level: string; }</code> — Formatted level object</td>
</tr>
<tr>
<td><strong>Location</strong></td>
<td><code>C:/Users/chris/git/flarelette-hono/src/logging.ts:53</code></td>
</tr>
</tbody>
</table>

**Parameters:**

- `label`: <code>string</code> — - Log level label (e.g., 'info', 'error')

---
##### `generateTimestamp()`

Generate ISO 8601 timestamp for logs (ADR-0013 requirement)

Returns current timestamp in ISO 8601 format with milliseconds,
formatted as a JSON fragment for Pino.

<table>
<tbody>
<tr>
<td><strong>Type</strong></td>
<td><code>function</code></td>
</tr>
<tr>
<td><strong>Visibility</strong></td>
<td><code>public</code></td>
</tr>
<tr>
<td><strong>Returns</strong></td>
<td><code>string</code> — Formatted timestamp string</td>
</tr>
<tr>
<td><strong>Location</strong></td>
<td><code>C:/Users/chris/git/flarelette-hono/src/logging.ts:66</code></td>
</tr>
</tbody>
</table>



---
##### `extractRequestId()`

Request ID extractor for correlation (ADR-0013 requirement)

Returns undefined to let hono-pino automatically extract X-Request-ID header.
This enables distributed tracing across service boundaries.

<table>
<tbody>
<tr>
<td><strong>Type</strong></td>
<td><code>function</code></td>
</tr>
<tr>
<td><strong>Visibility</strong></td>
<td><code>public</code></td>
</tr>
<tr>
<td><strong>Returns</strong></td>
<td><code>undefined</code> — Always undefined (handled by hono-pino)</td>
</tr>
<tr>
<td><strong>Location</strong></td>
<td><code>C:/Users/chris/git/flarelette-hono/src/logging.ts:79</code></td>
</tr>
</tbody>
</table>



---
##### `createLogger()`

Create ADR-0013 compliant structured logger

Returns a Hono middleware that automatically logs request start/completion
and provides a structured logger instance in the context.

**ADR-0013 Schema:**
```json
{
  "timestamp": "2025-11-02T12:34:56.789Z",
  "level": "info",
  "service": "bond-valuation",
  "requestId": "uuid-v4",
  "message": "Request completed",
  "duration": 125,
  "method": "POST",
  "path": "/api/price",
  "status": 200
}
```

**Request Correlation:**
The logger automatically extracts and propagates `X-Request-ID` header
for distributed tracing across service boundaries.

<table>
<tbody>
<tr>
<td><strong>Type</strong></td>
<td><code>function</code></td>
</tr>
<tr>
<td><strong>Visibility</strong></td>
<td><code>public</code></td>
</tr>
<tr>
<td><strong>Returns</strong></td>
<td><code>MiddlewareHandler</code> — Hono middleware for structured logging</td>
</tr>
<tr>
<td><strong>Location</strong></td>
<td><code>C:/Users/chris/git/flarelette-hono/src/logging.ts:145</code></td>
</tr>
</tbody>
</table>

**Parameters:**

- `options`: <code>import("C:/Users/chris/git/flarelette-hono/src/logging").LoggerOptions</code> — - Logger configuration
**Examples:**
```typescript

```
```typescript

```

---

</details>

---

<div align="center">
<sub><a href="./chrislyons_dev_flarelette_hono.md">← Back to Container</a> | <a href="./README.md">← Back to System</a> | Generated with <a href="https://github.com/chrislyons-dev/archlette">Archlette</a></sub>
</div>
