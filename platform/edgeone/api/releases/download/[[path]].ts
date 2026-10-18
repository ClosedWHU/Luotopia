/** `/api/releases/download/*` — EdgeOne Makers entry. Thin delegator; see `../../../delegate.ts`. */

import { delegate, type EdgeOneContext } from "../../../delegate";

async function onRequest(context: EdgeOneContext): Promise<Response> {
  return delegate(context);
}

export { onRequest };
export default onRequest;
