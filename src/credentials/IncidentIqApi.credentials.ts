import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class IncidentIqApi implements ICredentialType {
  name = 'incidentIqApi';
  displayName = 'IncidentIQ API';
  documentationUrl = 'https://developer.incidentiq.com/';

  properties: INodeProperties[] = [
    {
      displayName: 'Instance URL',
      name: 'instanceUrl',
      type: 'string',
      default: '',
      placeholder: 'https://yourdistrict.incidentiq.com',
      description: 'Your IncidentIQ instance base URL (no trailing slash)',
      required: true,
    },
    {
      displayName: 'API Token',
      name: 'apiToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'Your IncidentIQ API bearer token',
      required: true,
    },
    {
      displayName: 'Site ID',
      name: 'siteId',
      type: 'string',
      default: '',
      description: 'Your IncidentIQ Site ID (used in the Client header)',
      required: true,
    },
    {
      displayName: 'Integration User ID',
      name: 'integrationUserId',
      type: 'string',
      default: '',
      description:
        'The UserId of your API service account. Used to detect feedback loops — if a change was made by this user, downstream nodes can skip processing.',
    },
    {
      displayName: 'Product ID',
      name: 'productId',
      type: 'string',
      default: '',
      description:
        'The ProductId for your IIQ product/module (e.g., Help Desk, Asset Management). Required by some endpoints. Find it in any ticket or asset response under ProductId.',
    },
  ];
}
