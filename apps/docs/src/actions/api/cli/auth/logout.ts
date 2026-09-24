"no action";

import { cliAuthGone } from "../http";

export const onRequestPost: PagesFunction<Env> = async () => cliAuthGone();
