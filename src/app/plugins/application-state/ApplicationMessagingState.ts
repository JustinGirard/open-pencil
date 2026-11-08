import { BaseData } from '@/app/plugins/base/BaseData'
import { BridgeMessage } from './BridgeMessage'

export class ApplicationMessagingState extends BaseData.define({
  incoming: [{ listOf: BridgeMessage }, []],
  pending: [{ listOf: BridgeMessage }, []],
  finalized: [{ listOf: BridgeMessage }, []],
}) {}
