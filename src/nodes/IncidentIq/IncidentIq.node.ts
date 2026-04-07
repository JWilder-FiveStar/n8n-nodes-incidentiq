import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IHttpRequestMethods,
  IRequestOptions,
  NodeApiError,
} from 'n8n-workflow';

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════

async function iiqApiRequest(
  ef: IExecuteFunctions,
  method: IHttpRequestMethods,
  endpoint: string,
  body: object = {},
): Promise<any> {
  const credentials = await ef.getCredentials('incidentIqApi');
  const baseUrl = (credentials.instanceUrl as string).replace(/\/$/, '');
  const productId = (credentials.productId as string) || '';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.apiToken}`,
    SiteId: credentials.siteId as string,
    Client: 'ApiClient',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (productId) headers['ProductId'] = productId;

  const options: IRequestOptions = {
    method,
    uri: `${baseUrl}${endpoint}`,
    headers,
    body,
    json: true,
  };
  if (method === 'GET' || method === 'DELETE') delete options.body;

  try {
    return await ef.helpers.request(options);
  } catch (error) {
    throw new NodeApiError(ef.getNode(), error as any);
  }
}

/**
 * POST-based paginated search using $p/$s query params.
 * Used by: tickets, users (POST endpoints with Filters body)
 */
async function iiqPostPaginatedRequest(
  ef: IExecuteFunctions,
  endpoint: string,
  filterBody: object = {},
  limit?: number,
): Promise<any[]> {
  const results: any[] = [];
  const pageSize = limit ? Math.min(100, limit) : 100;
  let pageIndex = 0;
  let hasMore = true;

  while (hasMore) {
    const currentSize = limit ? Math.min(pageSize, limit - results.length) : pageSize;
    const url = `${endpoint}?$p=${pageIndex}&$s=${currentSize}`;
    const response = await iiqApiRequest(ef, 'POST', url, filterBody);
    const items = response?.Items ?? response ?? [];

    if (Array.isArray(items)) {
      results.push(...items);
    } else {
      results.push(items);
      break;
    }
    pageIndex++;
    if (items.length < currentSize) hasMore = false;
    if (limit && results.length >= limit) return results.slice(0, limit);
  }
  return results;
}

/**
 * GET-based paginated list using $p/$s query params.
 * Used by: assets, issues, locations, teams, categories
 */
async function iiqGetPaginatedRequest(
  ef: IExecuteFunctions,
  endpoint: string,
  limit?: number,
  extraParams: Record<string, string> = {},
): Promise<any[]> {
  const results: any[] = [];
  const pageSize = limit ? Math.min(100, limit) : 100;
  let pageIndex = 0;
  let hasMore = true;

  while (hasMore) {
    const currentSize = limit ? Math.min(pageSize, limit - results.length) : pageSize;
    const qs = new URLSearchParams({
      $p: String(pageIndex),
      $s: String(currentSize),
      ...extraParams,
    });
    const response = await iiqApiRequest(ef, 'GET', `${endpoint}?${qs.toString()}`);
    const items = response?.Items ?? response ?? [];

    if (Array.isArray(items)) {
      results.push(...items);
    } else {
      results.push(items);
      break;
    }
    pageIndex++;
    if (items.length < currentSize) hasMore = false;
    if (limit && results.length >= limit) return results.slice(0, limit);
  }
  return results;
}

// ═══════════════════════════════════════════════
//  NODE
// ═══════════════════════════════════════════════

export class IncidentIq implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'IncidentIQ',
    name: 'incidentIq',
    icon: 'file:incidentiq.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Interact with the IncidentIQ API',
    defaults: { name: 'IncidentIQ' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'incidentIqApi', required: true }],
    properties: [

      // ─────────────────────────────────
      //  RESOURCE
      // ─────────────────────────────────
      {
        displayName: 'Resource', name: 'resource', type: 'options', noDataExpression: true,
        options: [
          { name: 'Ticket', value: 'ticket' },
          { name: 'User', value: 'user' },
          { name: 'Asset', value: 'asset' },
          { name: 'Issue', value: 'issue' },
          { name: 'Team', value: 'team' },
          { name: 'Category', value: 'category' },
          { name: 'Location', value: 'location' },
          { name: 'Custom', value: 'custom' },
        ],
        default: 'ticket',
      },

      // ─────────────────────────────────
      //  OPERATIONS
      // ─────────────────────────────────

      // Ticket
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['ticket'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create a ticket' },
          { name: 'Create (Simplified)', value: 'createSimplified', action: 'Create ticket with readable identifiers' },
          { name: 'Get', value: 'get', action: 'Get a ticket' },
          { name: 'Get Many', value: 'getMany', action: 'Search tickets' },
          { name: 'Update', value: 'update', action: 'Update a ticket' },
          { name: 'Delete', value: 'delete', action: 'Delete a ticket' },
          { name: 'Assign', value: 'assign', action: 'Assign a ticket' },
          { name: 'Change Workflow Step', value: 'changeWorkflowStep', action: 'Move ticket to a workflow step' },
          { name: 'Add Comment', value: 'addComment', action: 'Add a comment' },
          { name: 'Get Activities', value: 'getActivities', action: 'Get ticket activity history' },
          { name: 'Link Asset', value: 'linkAsset', action: 'Link an asset to a ticket' },
        ],
        default: 'getMany',
      },

      // User
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['user'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get a user' },
          { name: 'Get Many', value: 'getMany', action: 'Search users' },
          { name: 'Lookup by Email', value: 'lookupByEmail', action: 'Look up user by email' },
        ],
        default: 'get',
      },

      // Asset
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['asset'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create an asset' },
          { name: 'Get', value: 'get', action: 'Get an asset' },
          { name: 'Get Many', value: 'getMany', action: 'List assets' },
          { name: 'Update', value: 'update', action: 'Update an asset' },
          { name: 'Search by Asset Tag', value: 'searchByTag', action: 'Find asset by tag' },
          { name: 'Search by Serial', value: 'searchBySerial', action: 'Find asset by serial number' },
          { name: 'Checkout', value: 'checkout', action: 'Check out asset to user' },
          { name: 'Checkin', value: 'checkin', action: 'Check in an asset' },
        ],
        default: 'getMany',
      },

      // Issue
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['issue'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get an issue by ID' },
          { name: 'List Site Issues', value: 'getMany', action: 'List site issues (IDs only)' },
          { name: 'List Issue Types', value: 'getTypes', action: 'List issue types with names' },
          { name: 'List All Issues', value: 'listIssues', action: 'List all issues with names and categories' },
          { name: 'Lookup by Name', value: 'lookupByName', action: 'Find an issue by name' },
        ],
        default: 'getMany',
      },

      // Team
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['team'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get a team' },
          { name: 'Get Many', value: 'getMany', action: 'List all teams' },
          { name: 'Get Members', value: 'getMembers', action: 'Get team members' },
        ],
        default: 'getMany',
      },

      // Category
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['category'] } },
        options: [
          { name: 'Get Many', value: 'getMany', action: 'List all categories' },
        ],
        default: 'getMany',
      },

      // Location
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['location'] } },
        options: [
          { name: 'Get', value: 'get', action: 'Get a location' },
          { name: 'Get Many', value: 'getMany', action: 'List locations' },
        ],
        default: 'getMany',
      },

      // Custom
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        displayOptions: { show: { resource: ['custom'] } },
        options: [
          { name: 'API Request', value: 'apiRequest', action: 'Make a custom API request' },
        ],
        default: 'apiRequest',
      },

      // ─────────────────────────────────
      //  SHARED: Feedback Loop Detection
      // ─────────────────────────────────
      {
        displayName: 'Check for Feedback Loop', name: 'checkFeedbackLoop', type: 'boolean', default: false,
        description: 'Compare incoming ModifiedBy against your Integration User ID to prevent infinite webhook loops.',
      },
      {
        displayName: 'Modified By Field', name: 'modifiedByField', type: 'string', default: 'ModifiedBy',
        displayOptions: { show: { checkFeedbackLoop: [true] } },
      },

      // ─────────────────────────────────
      //  FIELD: IDs
      // ─────────────────────────────────
      {
        displayName: 'Ticket ID', name: 'ticketId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['get', 'update', 'delete', 'assign', 'changeWorkflowStep', 'addComment', 'getActivities', 'linkAsset'] } },
      },
      {
        displayName: 'User ID', name: 'userId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['user'], operation: ['get'] } },
      },
      {
        displayName: 'Email', name: 'email', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['user'], operation: ['lookupByEmail'] } },
      },
      {
        displayName: 'Asset ID', name: 'assetId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['asset'], operation: ['get', 'update', 'checkout', 'checkin'] } },
      },
      {
        displayName: 'Issue ID', name: 'issueId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['issue'], operation: ['get'] } },
      },
      {
        displayName: 'Team ID', name: 'teamId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['team'], operation: ['get', 'getMembers'] } },
      },
      {
        displayName: 'Location ID', name: 'locationId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['location'], operation: ['get'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Create
      // ─────────────────────────────────
      {
        displayName: 'Subject', name: 'subject', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },
      {
        displayName: 'Description (HTML)', name: 'description', type: 'string', typeOptions: { rows: 4 }, default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },
      {
        displayName: 'For User ID', name: 'forUserId', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },
      {
        displayName: 'Issue ID', name: 'ticketIssueId', type: 'string', default: '',
        description: 'IssueId UUID for the ticket category/issue type',
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },
      {
        displayName: 'Location ID', name: 'ticketLocationId', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },
      {
        displayName: 'Assigned To Team ID', name: 'assignedToTeamId', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['create'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Create Simplified
      // ─────────────────────────────────
      {
        displayName: 'For Username (Email)', name: 'forUsername', type: 'string', default: '',
        placeholder: 'jsmith@district.edu', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },
      {
        displayName: 'Issue Name', name: 'issueName', type: 'string', default: '',
        placeholder: 'Broken Screen', required: true,
        description: 'Must match an existing issue name exactly in IIQ.',
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },
      {
        displayName: 'Subject', name: 'simpleSubject', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },
      {
        displayName: 'Description', name: 'simpleDescription', type: 'string', typeOptions: { rows: 4 }, default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },
      {
        displayName: 'Asset Tag', name: 'simpleAssetTag', type: 'string', default: '', placeholder: 'ASSET-12345',
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },
      {
        displayName: 'Additional Fields (JSON)', name: 'simpleAdditionalJson', type: 'json', default: '{}',
        displayOptions: { show: { resource: ['ticket'], operation: ['createSimplified'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Assign
      // ─────────────────────────────────
      {
        displayName: 'Assign To User ID', name: 'assignToUserId', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['assign'] } },
      },
      {
        displayName: 'Assign To Team ID', name: 'assignToTeamId', type: 'string', default: '',
        displayOptions: { show: { resource: ['ticket'], operation: ['assign'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Change Workflow Step
      // ─────────────────────────────────
      {
        displayName: 'Workflow Step ID', name: 'workflowStepId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['changeWorkflowStep'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Comment
      // ─────────────────────────────────
      {
        displayName: 'Comment (HTML)', name: 'commentBody', type: 'string', typeOptions: { rows: 3 },
        default: '', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['addComment'] } },
      },
      {
        displayName: 'Comment Is Private', name: 'commentIsPrivate', type: 'boolean', default: false,
        displayOptions: { show: { resource: ['ticket'], operation: ['addComment'] } },
      },

      // ─────────────────────────────────
      //  TICKET: Link Asset
      // ─────────────────────────────────
      {
        displayName: 'Asset ID to Link', name: 'linkAssetId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['ticket'], operation: ['linkAsset'] } },
      },

      // ─────────────────────────────────
      //  TICKET / ASSET: Update body
      // ─────────────────────────────────
      {
        displayName: 'Update Fields (JSON)', name: 'updateFieldsJson', type: 'json', default: '{}',
        displayOptions: { show: { resource: ['ticket', 'asset'], operation: ['update'] } },
      },

      // ─────────────────────────────────
      //  ASSET: Create
      // ─────────────────────────────────
      {
        displayName: 'Asset Tag', name: 'newAssetTag', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },
      {
        displayName: 'Serial Number', name: 'newSerialNumber', type: 'string', default: '',
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },
      {
        displayName: 'Model ID', name: 'modelId', type: 'string', default: '',
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },
      {
        displayName: 'Location ID', name: 'assetLocationId', type: 'string', default: '',
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },
      {
        displayName: 'Owner User ID', name: 'ownerUserId', type: 'string', default: '',
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },
      {
        displayName: 'Additional Fields (JSON)', name: 'assetAdditionalJson', type: 'json', default: '{}',
        displayOptions: { show: { resource: ['asset'], operation: ['create'] } },
      },

      // ─────────────────────────────────
      //  ASSET: Search by Tag / Serial
      // ─────────────────────────────────
      {
        displayName: 'Asset Tag', name: 'searchAssetTag', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['asset'], operation: ['searchByTag'] } },
      },
      {
        displayName: 'Serial Number', name: 'searchSerial', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['asset'], operation: ['searchBySerial'] } },
      },

      // ─────────────────────────────────
      //  ASSET: Checkout
      // ─────────────────────────────────
      {
        displayName: 'Checkout To User ID', name: 'checkoutUserId', type: 'string', default: '', required: true,
        displayOptions: { show: { resource: ['asset'], operation: ['checkout'] } },
      },
      {
        displayName: 'Expected Return Date', name: 'expectedReturnDate', type: 'string', default: '',
        placeholder: '2026-06-01T00:00:00Z',
        displayOptions: { show: { resource: ['asset'], operation: ['checkout'] } },
      },

      // ─────────────────────────────────
      //  ISSUE: Lookup by Name
      // ─────────────────────────────────
      {
        displayName: 'Issue Name Search', name: 'issueSearchName', type: 'string', default: '',
        placeholder: 'Broken Screen', required: true,
        displayOptions: { show: { resource: ['issue'], operation: ['lookupByName'] } },
      },

      // ─────────────────────────────────
      //  ISSUE: List Issues options
      // ─────────────────────────────────
      {
        displayName: 'Apply Site Visibility', name: 'applySiteVisibility', type: 'boolean', default: true,
        description: 'When true, only returns issues visible at the current site. When false, returns all issues regardless of site visibility.',
        displayOptions: { show: { resource: ['issue'], operation: ['listIssues'] } },
      },

      // ─────────────────────────────────
      //  PAGINATION
      // ─────────────────────────────────
      {
        displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false,
        displayOptions: { show: { operation: ['getMany', 'getTypes', 'listIssues'] } },
      },
      {
        displayName: 'Limit', name: 'limit', type: 'number', default: 50,
        typeOptions: { minValue: 1, maxValue: 250 },
        displayOptions: { show: { operation: ['getMany', 'getTypes', 'listIssues'], returnAll: [false] } },
      },
      {
        displayName: 'Filter (JSON)', name: 'filterJson', type: 'json', default: '{}',
        description: 'Filter body merged into the search request. For tickets/users use Filters array format. For assets use $filter query param format.',
        displayOptions: { show: { operation: ['getMany'] } },
      },

      // ─────────────────────────────────
      //  CUSTOM
      // ─────────────────────────────────
      {
        displayName: 'HTTP Method', name: 'customMethod', type: 'options',
        options: [
          { name: 'GET', value: 'GET' }, { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' }, { name: 'PATCH', value: 'PATCH' },
          { name: 'DELETE', value: 'DELETE' },
        ],
        default: 'GET',
        displayOptions: { show: { resource: ['custom'], operation: ['apiRequest'] } },
      },
      {
        displayName: 'Endpoint Path', name: 'customPath', type: 'string', default: '',
        placeholder: '/api/v1.0/tickets', required: true,
        displayOptions: { show: { resource: ['custom'], operation: ['apiRequest'] } },
      },
      {
        displayName: 'Body (JSON)', name: 'customBody', type: 'json', default: '{}',
        displayOptions: { show: { resource: ['custom'], operation: ['apiRequest'], customMethod: ['POST', 'PUT', 'PATCH'] } },
      },
    ],
  };

  // ═══════════════════════════════════════════════
  //  EXECUTE
  // ═══════════════════════════════════════════════

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (let i = 0; i < items.length; i++) {
      try {
        // ─── Feedback Loop Check ───
        const checkLoop = this.getNodeParameter('checkFeedbackLoop', i, false) as boolean;
        if (checkLoop) {
          const creds = await this.getCredentials('incidentIqApi');
          const integrationId = ((creds.integrationUserId as string) || '').toLowerCase();
          const field = this.getNodeParameter('modifiedByField', i, 'ModifiedBy') as string;
          const incoming = ((items[i].json[field] as string) ?? '').toLowerCase();
          if (integrationId && incoming === integrationId) continue;
        }

        // Helper to parse filter JSON from the UI
        const parseFilter = (idx: number): any => {
          const raw = this.getNodeParameter('filterJson', idx, '{}') as string;
          return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
        };

        let responseData: any;

        // ═════════════════════════════
        //  TICKETS
        //  Search: POST /api/v1.0/tickets?$p=0&$s=25
        //  Get:    GET  /api/v1.0/tickets/{id}
        //  Create: POST /api/v1.0/tickets/new
        // ═════════════════════════════
        if (resource === 'ticket') {

          if (operation === 'get') {
            const id = this.getNodeParameter('ticketId', i) as string;
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/tickets/${id}`);
          }

          if (operation === 'getMany') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            const filter = parseFilter(i);
            responseData = await iiqPostPaginatedRequest(this, '/api/v1.0/tickets', filter, limit);
          }

          if (operation === 'create') {
            const body: any = { Subject: this.getNodeParameter('subject', i) as string };
            const desc = this.getNodeParameter('description', i, '') as string;
            if (desc) body.IssueDescription = desc;
            const forUser = this.getNodeParameter('forUserId', i, '') as string;
            if (forUser) body.ForId = forUser;
            const issueId = this.getNodeParameter('ticketIssueId', i, '') as string;
            if (issueId) body.IssueId = issueId;
            const locId = this.getNodeParameter('ticketLocationId', i, '') as string;
            if (locId) body.LocationId = locId;
            const teamId = this.getNodeParameter('assignedToTeamId', i, '') as string;
            if (teamId) body.AssignedToTeamId = teamId;
            responseData = await iiqApiRequest(this, 'POST', '/api/v1.0/tickets/new', body);
          }

          if (operation === 'createSimplified') {
            const body: any = {
              ForUsername: this.getNodeParameter('forUsername', i) as string,
              Issue: this.getNodeParameter('issueName', i) as string,
            };
            const subject = this.getNodeParameter('simpleSubject', i, '') as string;
            if (subject) body.Subject = subject;
            const desc = this.getNodeParameter('simpleDescription', i, '') as string;
            if (desc) body.Description = desc;
            const tag = this.getNodeParameter('simpleAssetTag', i, '') as string;
            if (tag) body.AssetTag = tag;
            const addRaw = this.getNodeParameter('simpleAdditionalJson', i, '{}') as string;
            Object.assign(body, JSON.parse(typeof addRaw === 'string' ? addRaw : JSON.stringify(addRaw)));
            responseData = await iiqApiRequest(this, 'POST', '/api/v1.0/tickets/simple/new', body);
          }

          if (operation === 'update') {
            const id = this.getNodeParameter('ticketId', i) as string;
            const raw = this.getNodeParameter('updateFieldsJson', i, '{}') as string;
            responseData = await iiqApiRequest(this, 'PUT', `/api/v1.0/tickets/${id}`, JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
          }

          if (operation === 'delete') {
            const id = this.getNodeParameter('ticketId', i) as string;
            responseData = await iiqApiRequest(this, 'DELETE', `/api/v1.0/tickets/${id}`);
          }

          if (operation === 'assign') {
            const id = this.getNodeParameter('ticketId', i) as string;
            const body: any = {};
            const userId = this.getNodeParameter('assignToUserId', i, '') as string;
            if (userId) body.AgentId = userId;
            const teamId = this.getNodeParameter('assignToTeamId', i, '') as string;
            if (teamId) body.TeamId = teamId;
            responseData = await iiqApiRequest(this, 'PUT', `/api/v1.0/tickets/${id}/assign`, body);
          }

          if (operation === 'changeWorkflowStep') {
            const id = this.getNodeParameter('ticketId', i) as string;
            const stepId = this.getNodeParameter('workflowStepId', i) as string;
            responseData = await iiqApiRequest(this, 'POST', `/api/v1.0/tickets/${id}/status/${stepId}`, {});
          }

          if (operation === 'addComment') {
            const id = this.getNodeParameter('ticketId', i) as string;
            responseData = await iiqApiRequest(this, 'POST', `/api/v1.0/tickets/${id}/comments`, {
              Body: this.getNodeParameter('commentBody', i) as string,
              IsPrivate: this.getNodeParameter('commentIsPrivate', i, false) as boolean,
            });
          }

          if (operation === 'getActivities') {
            const id = this.getNodeParameter('ticketId', i) as string;
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/tickets/${id}/activities`);
          }

          if (operation === 'linkAsset') {
            const id = this.getNodeParameter('ticketId', i) as string;
            responseData = await iiqApiRequest(this, 'POST', `/api/v1.0/tickets/${id}/assets`, {
              AssetId: this.getNodeParameter('linkAssetId', i) as string,
            });
          }
        }

        // ═════════════════════════════
        //  USERS
        //  Search: POST /api/v1.0/users?$p=0&$s=50
        //  Get:    GET  /api/v1.0/users/{id}
        // ═════════════════════════════
        if (resource === 'user') {

          if (operation === 'get') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/users/${this.getNodeParameter('userId', i)}`);
          }

          if (operation === 'getMany') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            responseData = await iiqPostPaginatedRequest(this, '/api/v1.0/users', parseFilter(i), limit);
          }

          if (operation === 'lookupByEmail') {
            const email = this.getNodeParameter('email', i) as string;
            const results = await iiqPostPaginatedRequest(this, '/api/v1.0/users', {
              Filters: [{ Facet: 'email', Value: email }],
            }, 1);
            responseData = results.length > 0 ? results[0] : { error: 'User not found', email };
          }
        }

        // ═════════════════════════════
        //  ASSETS
        //  List:   GET  /api/v1.0/assets?$p=0&$s=50
        //  Get:    GET  /api/v1.0/assets/{id}
        //  Create: POST /api/v1.0/assets/new
        // ═════════════════════════════
        if (resource === 'asset') {

          if (operation === 'get') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/assets/${this.getNodeParameter('assetId', i)}`);
          }

          if (operation === 'getMany') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            const filter = parseFilter(i);
            const qp: Record<string, string> = {};
            if (filter.$filter) qp.$filter = filter.$filter;
            if (filter.$o) qp.$o = filter.$o;
            if (filter.$d) qp.$d = filter.$d;
            responseData = await iiqGetPaginatedRequest(this, '/api/v1.0/assets', limit, qp);
          }

          if (operation === 'create') {
            const body: any = { AssetTag: this.getNodeParameter('newAssetTag', i) as string };
            const serial = this.getNodeParameter('newSerialNumber', i, '') as string;
            if (serial) body.SerialNumber = serial;
            const modelId = this.getNodeParameter('modelId', i, '') as string;
            if (modelId) body.ModelId = modelId;
            const locId = this.getNodeParameter('assetLocationId', i, '') as string;
            if (locId) body.LocationId = locId;
            const ownerId = this.getNodeParameter('ownerUserId', i, '') as string;
            if (ownerId) body.OwnerId = ownerId;
            const addRaw = this.getNodeParameter('assetAdditionalJson', i, '{}') as string;
            Object.assign(body, JSON.parse(typeof addRaw === 'string' ? addRaw : JSON.stringify(addRaw)));
            responseData = await iiqApiRequest(this, 'POST', '/api/v1.0/assets/new', body);
          }

          if (operation === 'update') {
            const id = this.getNodeParameter('assetId', i) as string;
            const raw = this.getNodeParameter('updateFieldsJson', i, '{}') as string;
            responseData = await iiqApiRequest(this, 'PUT', `/api/v1.0/assets/${id}`, JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)));
          }

          if (operation === 'searchByTag') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/assets/assettag/search/${encodeURIComponent(this.getNodeParameter('searchAssetTag', i) as string)}`);
          }

          if (operation === 'searchBySerial') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/assets/serial/search/${encodeURIComponent(this.getNodeParameter('searchSerial', i) as string)}`);
          }

          if (operation === 'checkout') {
            const id = this.getNodeParameter('assetId', i) as string;
            const body: any = { UserId: this.getNodeParameter('checkoutUserId', i) as string };
            const returnDate = this.getNodeParameter('expectedReturnDate', i, '') as string;
            if (returnDate) body.ExpectedReturnDate = returnDate;
            responseData = await iiqApiRequest(this, 'POST', `/api/v1.0/assets/${id}/checkout`, body);
          }

          if (operation === 'checkin') {
            responseData = await iiqApiRequest(this, 'POST', `/api/v1.0/assets/${this.getNodeParameter('assetId', i)}/checkin`, {});
          }
        }

        // ═════════════════════════════
        //  ISSUES
        //  GET /api/v1.0/issues/site (IDs only)
        //  GET /api/v1.0/issues/types (names + IDs, paginated)
        // ═════════════════════════════
        if (resource === 'issue') {

          if (operation === 'get') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/issues/${this.getNodeParameter('issueId', i)}`);
          }

          if (operation === 'getMany') {
            // /api/v1.0/issues/site — returns IssueIds scoped to current site (no names)
            responseData = await iiqApiRequest(this, 'GET', '/api/v1.0/issues/site');
            if (responseData?.Items) responseData = responseData.Items;
          }

          if (operation === 'getTypes') {
            // /api/v1.0/issues/types — returns Name, IssueTypeId, ProductId, Scope (paginated)
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            responseData = await iiqGetPaginatedRequest(this, '/api/v1.0/issues/types', limit);
          }

          if (operation === 'listIssues') {
            // POST /api/v1.0/issues — full issue definitions with Name, IssueId, IssueCategoryName, etc.
            // NOTE: GET is deprecated per IIQ support (Steve Copous) — must use POST with body
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            const applySiteVis = this.getNodeParameter('applySiteVisibility', i, true) as boolean;
            const body = {
              SiteScope: 'Aggregate',
              ApplySiteVisibility: applySiteVis,
            };
            responseData = await iiqPostPaginatedRequest(this, '/api/v1.0/issues', body, limit);
          }

          if (operation === 'lookupByName') {
            const searchName = this.getNodeParameter('issueSearchName', i) as string;
            // Pull all issue types (paginated, returns names)
            const allIssues = await iiqGetPaginatedRequest(this, '/api/v1.0/issues/types', undefined);
            const matches = allIssues.filter((issue: any) => {
              const name = (issue.Name || '').toLowerCase();
              return name.includes(searchName.toLowerCase());
            });
            responseData = matches.length > 0 ? matches : [{ error: 'No issues found matching', searchName }];
          }
        }

        // ═════════════════════════════
        //  TEAMS
        //  List: GET /api/v1.0/teams
        // ═════════════════════════════
        if (resource === 'team') {
          if (operation === 'get') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/teams/${this.getNodeParameter('teamId', i)}`);
          }
          if (operation === 'getMany') {
            responseData = await iiqApiRequest(this, 'GET', '/api/v1.0/teams');
          }
          if (operation === 'getMembers') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/teams/${this.getNodeParameter('teamId', i)}/members`);
          }
        }

        // ═════════════════════════════
        //  CATEGORIES
        //  List: GET /api/v1.0/categories
        // ═════════════════════════════
        if (resource === 'category') {
          if (operation === 'getMany') {
            responseData = await iiqApiRequest(this, 'GET', '/api/v1.0/categories/ticket');
            if (responseData?.Items) responseData = responseData.Items;
          }
        }

        // ═════════════════════════════
        //  LOCATIONS
        //  List: GET /api/v1.0/locations?$p=0&$s=50
        //  Get:  GET /api/v1.0/locations/{id}
        // ═════════════════════════════
        if (resource === 'location') {
          if (operation === 'get') {
            responseData = await iiqApiRequest(this, 'GET', `/api/v1.0/locations/${this.getNodeParameter('locationId', i)}`);
          }
          if (operation === 'getMany') {
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;
            const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
            responseData = await iiqGetPaginatedRequest(this, '/api/v1.0/locations', limit);
          }
        }

        // ═════════════════════════════
        //  CUSTOM
        // ═════════════════════════════
        if (resource === 'custom' && operation === 'apiRequest') {
          const method = this.getNodeParameter('customMethod', i) as IHttpRequestMethods;
          const path = this.getNodeParameter('customPath', i) as string;
          let body = {};
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            const raw = this.getNodeParameter('customBody', i, '{}') as string;
            body = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
          }
          responseData = await iiqApiRequest(this, method, path, body);
        }

        // ─── Push results ───
        if (Array.isArray(responseData)) {
          returnData.push(...responseData.map((item: any) => ({ json: item })));
        } else if (responseData) {
          returnData.push({ json: responseData });
        }

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
