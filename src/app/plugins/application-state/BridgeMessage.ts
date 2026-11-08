import { BaseData } from '@/app/plugins/base/BaseData'

export class BridgeMessage extends BaseData.define({
  id: 'string',
  url: 'string',
  payload: 'any',
  meta: 'any',
  created_at_ms: 'integer',
  timeout_ms: 'integer',
  response: ['any', null],
  outcome: ['string', null],
  completed_at_ms: ['integer', null],
}) {}
