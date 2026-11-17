interface BrandLogoProps {
  className?: string;
  alt?: string;
}

// Ícone "toolbox" do IconMCP (https://iconmcp.com, licença MIT), grade de 16 unidades.
export function BrandLogo({ className = "", alt = "Logo Toolkit GTI" }: BrandLogoProps) {
  return (
    <span
      role="img"
      aria-label={alt}
      className={`inline-grid place-items-center rounded-lg bg-accent text-white ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-[64%] w-[64%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="1.75" y="5.25" width="12.5" height="8.5" rx="2" />
        <path d="M5.25 5.25 L5.25 3.3 C5.25 2.858 5.608 2.5 6.05 2.5 L9.95 2.5 C10.392 2.5 10.75 2.858 10.75 3.3 L10.75 5.25" />
        <line x1="1.75" y1="9.25" x2="14.25" y2="9.25" />
      </svg>
    </span>
  );
}
