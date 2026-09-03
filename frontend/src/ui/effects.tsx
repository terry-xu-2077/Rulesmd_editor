import React, { CSSProperties } from "react";
import "./effects.css";

const particles = [
  [12,2.9,.2],[25,3.8,.8],[18,2.6,1.1],[10,4.4,.4],[30,3.1,1.5],
  [15,2.4,.7],[20,5.1,.1],[10,3.6,1.3],[25,2.8,.6],[15,4.2,1.6],
  [30,3.4,.9],[20,2.3,1.2],[10,4.7,.3],[25,3.0,1.8],[15,5.0,.5],
  [20,2.7,1.4],[30,4.0,.2],[10,3.3,1.0],[25,2.5,1.7],[15,4.5,.75],
];

export function ActiveParticleField({ active=true, className="" }: { active?:boolean; className?:string }) {
  if (!active) return null;
  return <div className={`ra2-active-particles ${className}`} aria-hidden="true"><ul>{particles.map(([size,duration,delay],i)=><li key={i} style={{"--p-size":`${size}px`,"--p-duration":`${duration}s`,"--p-delay":`${delay}s`} as CSSProperties}/>)}</ul></div>;
}

export function LegacyButton({ children, onClick, disabled=false, className="" }: React.PropsWithChildren<{onClick?:()=>void;disabled?:boolean;className?:string}>) {
  return <button type="button" className={`ra2-button ${className}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function StatusPill({ children, tone="normal" }: React.PropsWithChildren<{tone?:"normal"|"active"|"warning"|"danger"}>) {
  return <span className={`ra2-status-pill tone-${tone}`}>{children}</span>;
}
