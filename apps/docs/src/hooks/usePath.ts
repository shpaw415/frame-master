import { usePath as usePath_ } from "frame-master-plugin-react-to-html/hooks";
import { useEffect, useState } from "react";

export function usePath() {
	const _path = usePath_();
	const [current, set] = useState(_path);
	useEffect(() => {
		set(window.location.href);
	}, []);
	return current;
}
