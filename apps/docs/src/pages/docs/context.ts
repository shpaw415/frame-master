import { createContext } from "react";

export type AnchorItem = {
	id: string;
	title: string;
};

type AnchorContextType = {
	anchors: AnchorItem[];
	currentAnchor: string;
	addAnchor: (id: string, title: string) => void;
	removeAnchor: (id: string) => void;
	setCurrentAnchor: (anchor: string) => void;
};

export const AnchorContext = createContext<AnchorContextType>({
	anchors: [],
	currentAnchor: "",
	addAnchor: () => {},
	removeAnchor: () => {},
	setCurrentAnchor: () => {},
});
