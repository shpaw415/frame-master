import { useContext, useState } from "react";
import { RouterContext } from "./router";

export function Shell() {
  const routerContext = useContext(RouterContext);
  const [currentRoute, setRoute] = useState("/");
}
