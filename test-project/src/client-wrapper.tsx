// ClientWrapper is used client side only for state management
// you can create your own version of the routerHost

import { RouterHost } from "frame-master-plugin-apply-react/router";
import { StrictMode, type JSX } from "react";

export default function ClientWrapper({ children }: { children: JSX.Element }) {
  return (
    <StrictMode>
      <RouterHost>{children}</RouterHost>
    </StrictMode>
  );
}
