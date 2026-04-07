# n8n-nodes-incidentiq

Custom n8n node for the IncidentIQ API. Built for K-12 IT environments.

## Features

- **Tickets** — Create, Get, Search, Update, Add Comments
- **Users** — Get, Search, Lookup by Email
- **Assets** — Get, Search, Update
- **Locations** — Get, Get All
- **Custom API Request** — Hit any IIQ endpoint directly
- **Feedback Loop Prevention** — Built-in check to skip items modified by your integration user (prevents infinite webhook → update → webhook cycles)

## Installation

### Option A: npm link (development / local)

```bash
# Clone or copy this package to your machine
cd n8n-nodes-incidentiq

# Install dependencies
npm install

# Build
npm run build

# Link into n8n's custom nodes directory
# For n8n installed globally:
npm link
cd ~/.n8n
npm link n8n-nodes-incidentiq

# For n8n via Docker, mount the built package:
# docker run -v /path/to/n8n-nodes-incidentiq:/home/node/.n8n/custom/n8n-nodes-incidentiq ...
```

### Option B: Docker volume mount

If you run n8n in Docker, mount the **built** package:

```yaml
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n
    volumes:
      - ./n8n-nodes-incidentiq:/home/node/.n8n/nodes/n8n-nodes-incidentiq
    environment:
      - N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/nodes
```

### Option C: Copy to custom directory

```bash
npm run build
cp -r . ~/.n8n/custom/n8n-nodes-incidentiq
```

Then restart n8n. The "IncidentIQ" node should appear in the node panel.

## Credential Setup

1. In n8n, go to **Credentials** → **Add Credential** → **IncidentIQ API**
2. Fill in:
   - **Instance URL**: `https://yourdistrict.incidentiq.com`
   - **API Token**: Your bearer token
   - **Site ID**: Your IIQ site/tenant ID
   - **Integration User ID** *(optional)*: The GUID of your API service account — used for feedback loop detection

## Feedback Loop Prevention

The #1 gotcha with IIQ webhooks + automation: your workflow updates a ticket, IIQ fires a webhook, your workflow runs again, updates the ticket, webhook fires again... infinite loop.

This node has it built in:

1. Set your **Integration User ID** in the credential
2. On any node that receives webhook data, enable **"Check for Feedback Loop"**
3. Set the **Modified By Field** to match your webhook payload (usually `ModifiedBy` or `ModifiedById`)
4. If the modifier matches your integration user → the item is silently skipped

## Pagination

IIQ uses POST-body pagination (`$skip` / `$top`). The **Get Many** operations handle this automatically:

- **Return All = true**: Pages through all results automatically
- **Return All = false**: Returns up to the Limit you set
- **Filter (JSON)**: Merged into the pagination body — use IIQ's filter syntax

Example filter:
```json
{
  "$filter": "Status eq 'Open'",
  "$orderby": "CreatedDate desc"
}
```

## Custom API Request

For endpoints not covered by the built-in operations, use the **Custom** resource:

- Set HTTP method, path (e.g., `/api/v1.0/teams`), and optional body
- Uses the same auth headers automatically
- Good for one-off calls or hitting newer API endpoints

## Endpoints Reference

| Resource | Endpoint | Method |
|----------|----------|--------|
| Tickets Search | `/api/v1.0/tickets/grid` | POST |
| Ticket Get | `/api/v1.0/tickets/{id}` | GET |
| Ticket Create | `/api/v1.0/tickets` | POST |
| Ticket Update | `/api/v1.0/tickets/{id}` | PUT |
| Ticket Comment | `/api/v1.0/tickets/{id}/comments` | POST |
| Users Search | `/api/v1.0/users/grid` | POST |
| User Get | `/api/v1.0/users/{id}` | GET |
| Assets Search | `/api/v1.0/assets/grid` | POST |
| Asset Get | `/api/v1.0/assets/{id}` | GET |
| Asset Update | `/api/v1.0/assets/{id}` | PUT |
| Locations Search | `/api/v1.0/locations/grid` | POST |
| Location Get | `/api/v1.0/locations/{id}` | GET |
