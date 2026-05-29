import { Link } from "react-router-dom";

const NautiplexLogo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2 ${className}`}>
    <img
      src="/nautiplex_logo.png"
      alt="Nautiplex logo"
      className="h-10 w-10 object-contain"
      loading="eager"
      decoding="async"
    />
    <div className="flex flex-col leading-none">
      <span className="text-xl font-heading font-bold tracking-tight text-foreground">
        Nautiplex
      </span>
      <span className="text-[10px] font-body uppercase tracking-[0.2em] text-muted-foreground">
        Sea Experiences
      </span>
    </div>
  </Link>
);

export default NautiplexLogo;

