import { useEffect, useState } from "react";

export default function PageTransition() {
	const [isVisible, setIsVisible] = useState(false);
	const [isFirstLoad, setIsFirstLoad] = useState(true);

	useEffect(() => {
		// Only show on first load
		if (isFirstLoad) {
			setIsVisible(true);
			setIsFirstLoad(false);

			// Hide after animation completes
			const timer = setTimeout(() => {
				setIsVisible(false);
			}, 4500); // Total animation duration

			return () => clearTimeout(timer);
		}
	}, [isFirstLoad]);

	if (!isVisible) return null;

	return (
		<div className="page-transition-overlay">
			<div className="page-transition-content">
				<div className="page-transition-text-wrapper">
					<h1 className="page-transition-text">
						<span className="page-transition-letter">W</span>
						<span className="page-transition-letter">e</span>
						<span className="page-transition-letter">l</span>
						<span className="page-transition-letter">c</span>
						<span className="page-transition-letter">o</span>
						<span className="page-transition-letter">m</span>
						<span className="page-transition-letter">e</span>
						<span className="page-transition-letter-space"> </span>
						<span className="page-transition-letter">t</span>
						<span className="page-transition-letter">o</span>
					</h1>
					<h2 className="page-transition-brand">
						<span className="page-transition-brand-letter">F</span>
						<span className="page-transition-brand-letter">r</span>
						<span className="page-transition-brand-letter">a</span>
						<span className="page-transition-brand-letter">m</span>
						<span className="page-transition-brand-letter">e</span>
						<span className="page-transition-brand-letter">-</span>
						<span className="page-transition-brand-letter">M</span>
						<span className="page-transition-brand-letter">a</span>
						<span className="page-transition-brand-letter">s</span>
						<span className="page-transition-brand-letter">t</span>
						<span className="page-transition-brand-letter">e</span>
						<span className="page-transition-brand-letter">r</span>
						<span className="page-transition-brand-letter">!</span>
					</h2>
				</div>
				<div className="page-transition-particles">
					{[...Array(20)].map((_, i) => (
						<div key={i} className="particle" style={{ "--i": i } as any} />
					))}
				</div>
			</div>
		</div>
	);
}
