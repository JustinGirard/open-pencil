import { BaseData } from '@/app/plugins/base/BaseData'

export class GraphFileState extends BaseData.define({
  selected_graph_id: ['string', ''],
  selected_graph_path: ['string', ''],
  graph_list_dirty_at_ms: ['integer', 0]
}) {}
