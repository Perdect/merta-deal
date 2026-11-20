/**
 * Decorative sign-in illustration: a Rajasthani skyline (chhatris and domes) with a delivery rider on
 * a brand-green scooter over a green ground band. Pure SVG, no image request; hidden from screen readers.
 */
export function LoginArt({ className, viewBox = "-30 0 380 240" }: { className?: string; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} className={className} preserveAspectRatio="xMidYMax slice" aria-hidden>
      {/* Skyline (extends past the frame so wide banners have no gaps) */}
      <path fill="#eceee9" d="M-60 182v-40h18v-6c0-7 5-12 10-12s10 5 10 12v6h22v40zM320 182v-46h14v-8c0-8 6-14 12-14s12 6 12 14v8h22v46z" />
      <path fill="#eceee9" d="M0 182V128h14v-8c0-9 6-15 12-15s12 6 12 15v8h12V98c0-17 11-30 24-30s24 13 24 30v30h10V86l7-16 7 16v42h10V102c0-21 14-38 30-38s30 17 30 38v26h10v-10c0-9 6-15 12-15s12 6 12 15v10h12V92c0-19 12-34 26-34s26 15 26 34v36h14v-6c0-8 5-13 10-13s10 5 10 13v60z" />
      <g fill="#dfe2dc">
        <path d="M66 128v-14a8 8 0 0 1 16 0v14zM150 128v-16a10 10 0 0 1 20 0v16zM240 128v-16a8 8 0 0 1 16 0v16z" />
        <rect x="20" y="140" width="10" height="14" rx="5" /><rect x="96" y="140" width="10" height="14" rx="5" /><rect x="128" y="140" width="10" height="14" rx="5" />
        <rect x="182" y="140" width="10" height="14" rx="5" /><rect x="214" y="140" width="10" height="14" rx="5" /><rect x="290" y="140" width="10" height="14" rx="5" />
      </g>
      {/* Ground band */}
      <path fill="#329537" d="M-60 198C40 172 280 172 380 198v42H-60z" />
      {/* Scooter */}
      <g>
        <ellipse cx="180" cy="203" rx="72" ry="5" fill="#26782a" opacity=".5" />
        <circle cx="134" cy="190" r="16" fill="#1f2a24" /><circle cx="134" cy="190" r="6.5" fill="#a9b3ad" />
        <circle cx="228" cy="190" r="16" fill="#1f2a24" /><circle cx="228" cy="190" r="6.5" fill="#a9b3ad" />
        <rect x="100" y="104" width="50" height="44" rx="7" fill="#26782a" />
        <rect x="100" y="104" width="50" height="9" rx="4" fill="#1c5f1f" />
        <path d="M112 122h4l3.5 13h15l3-9h-19" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="121" cy="139.5" r="1.8" fill="#fff" /><circle cx="132" cy="139.5" r="1.8" fill="#fff" />
        <path d="M110 184c0-21 15-33 38-33h44c12 0 18 8 18 19v14z" fill="#329537" />
        <path d="M118 178h70" stroke="#26782a" strokeWidth="3" strokeLinecap="round" />
        <path d="M204 184l13-58h10l-11 58z" fill="#26782a" />
        <path d="M210 188a18 18 0 0 1 36 0" fill="none" stroke="#329537" strokeWidth="6" />
        <rect x="211" y="119" width="26" height="5" rx="2.5" fill="#1f2a24" />
        <circle cx="232" cy="133" r="5" fill="#F2A93B" />
      </g>
      {/* Rider */}
      <g>
        <path d="M164 152l20 3 10 26" fill="none" stroke="#2f3f6e" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M190 182h12" stroke="#1f2a24" strokeWidth="6" strokeLinecap="round" />
        <path d="M156 152l12-44h20l6 44z" fill="#F2A93B" />
        <path d="M186 114l24 8" stroke="#F2A93B" strokeWidth="8" strokeLinecap="round" />
        <circle cx="212" cy="122" r="4" fill="#c98b5e" />
        <circle cx="180" cy="94" r="11" fill="#c98b5e" />
        <path d="M168 95a12.5 12.5 0 0 1 25 0z" fill="#1c5f1f" />
        <path d="M185 88h10a3 3 0 0 1 0 6h-8z" fill="#bfe3c1" />
      </g>
    </svg>
  );
}
