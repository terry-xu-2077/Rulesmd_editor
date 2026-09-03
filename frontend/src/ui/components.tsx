import React, { CSSProperties, ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import "./legacy-tokens.css";
import "./legacy-motion.css";
import "./generic-components.css";

export type LegacyOption = { value: string; label?: string; group?: string };
export type AccentTone = "blue" | "red" | "purple" | "neutral";

export function LegacyTooltip({ text, children }: { text?: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return <span className="legacy-tooltip-host">{children}<span className="legacy-tooltip">{text}</span></span>;
}

export function ResetButton({ visible, onClick, label = "还原" }: { visible: boolean; onClick: () => void; label?: string }) {
  return <button type="button" className={`legacy-reset ${visible ? "is-visible" : ""}`} onClick={onClick} aria-label={label}><RotateCcw size={16}/><span>{label}</span></button>;
}

export function TextField({ value, rawValue, onChange, placeholder, tooltip, disabled }: { value: string; rawValue?: string; onChange: (v: string) => void; placeholder?: string; tooltip?: string; disabled?: boolean }) {
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="legacy-control-wrap"><LegacyTooltip text={tooltip}><div className="legacy-control legacy-text"><input value={value} disabled={disabled} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></div></LegacyTooltip>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function BoolSwitch({ value, rawValue, onChange, trueValue = "yes", falseValue = "no", disabled }: { value: string; rawValue?: string; onChange:(v:string)=>void; trueValue?: string; falseValue?: string; disabled?:boolean }) {
  const on = value.toLowerCase() === trueValue.toLowerCase();
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="legacy-control-wrap"><button type="button" disabled={disabled} className={`legacy-control legacy-bool ${on ? "is-on" : ""}`} onClick={()=>onChange(on ? falseValue : trueValue)}><span className="legacy-bool-knob">{on ? "ON 开" : "OFF 关"}</span></button>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

function useOutsideClose(open: boolean, close: ()=>void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if (!open) return;
    const fn = (e: MouseEvent)=>{ if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", fn);
    return ()=>document.removeEventListener("mousedown", fn);
  },[open, close]);
  return ref;
}

export function Select({ value, rawValue, options, onChange, tooltip, disabled }: { value:string; rawValue?:string; options:LegacyOption[]; onChange:(v:string)=>void; tooltip?:string; disabled?:boolean }) {
  const [open,setOpen] = useState(false);
  const ref = useOutsideClose(open, ()=>setOpen(false));
  const selected = options.find(o=>o.value===value);
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="legacy-control-wrap" ref={ref}><LegacyTooltip text={tooltip}><div className={`legacy-control legacy-select ${open?"is-open":""}`}><button disabled={disabled} type="button" className="legacy-select-button" onClick={()=>setOpen(v=>!v)}><span>{selected?.label ?? value}</span><ChevronDown size={20}/></button>{open && <div className="legacy-pop legacy-select-list legacy-pop-in">{options.map(o=><button type="button" key={o.value} className="legacy-select-item" onClick={()=>{onChange(o.value);setOpen(false)}}>{o.label ?? o.value}</button>)}</div>}</div></LegacyTooltip>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function Slider({ value, rawValue, min=0, max=100, step=1, onChange, disabled }: { value:number; rawValue?:number; min?:number; max?:number; step?:number; onChange:(v:number)=>void; disabled?:boolean }) {
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="legacy-control-wrap"><div className="legacy-control legacy-slider"><input className="legacy-range" disabled={disabled} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/><input className="legacy-number" disabled={disabled} type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></div>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function MultiSelect({ values, rawValues, options, onChange, title="选择项目", disabled }: { values:string[]; rawValues?:string[]; options:LegacyOption[]; onChange:(v:string[])=>void; title?:string; disabled?:boolean }) {
  const [open,setOpen] = useState(false);
  const ref = useOutsideClose(open, ()=>setOpen(false));
  const rawKey = rawValues?.join(","); const valueKey = values.join(",");
  const changed = rawValues !== undefined && rawKey !== valueKey;
  const labels = useMemo(()=>values.map(v=>options.find(o=>o.value===v)?.label ?? v).join(", "),[values,options]);
  const toggle=(v:string)=>onChange(values.includes(v)?values.filter(x=>x!==v):[...values,v]);
  return <div className="legacy-control-wrap" ref={ref}><div className="legacy-control legacy-multi"><button disabled={disabled} type="button" className="legacy-select-button" onClick={()=>setOpen(v=>!v)}><span>{labels || "未选择"}</span><ChevronDown size={20}/></button>{open && <div className="legacy-pop legacy-picker legacy-pop-in"><div className="legacy-picker-title">{title}</div><div className="legacy-picker-body">{options.map(o=><label className={`legacy-check-row ${o.group?"has-group":""}`} key={o.value}><input type="checkbox" checked={values.includes(o.value)} onChange={()=>toggle(o.value)}/><span className="legacy-check-box">{values.includes(o.value)&&<Check size={13}/>}</span><span>{o.label ?? o.value}</span>{o.group&&<em>{o.group}</em>}</label>)}</div><div className="legacy-picker-actions"><button type="button" onClick={()=>setOpen(false)}><Check size={15}/>确定</button><button type="button" onClick={()=>setOpen(false)}><X size={15}/>关闭</button></div></div>}</div>{rawValues && <ResetButton visible={changed} onClick={()=>onChange(rawValues)}/>}</div>;
}

export type EntityHeaderProps = {
  tone?: AccentTone;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  watermark?: string;
  pinned?: boolean;
  onPin?: ()=>void;
  className?: string;
  style?: CSSProperties;
};

export function EntityHeader({ tone="blue", icon, title, subtitle, watermark, pinned=false, onPin, className="", style }: EntityHeaderProps) {
  return <header className={`legacy-entity-header tone-${tone} ${className}`.trim()} style={style}><div className="legacy-entity-watermark">{watermark ?? title}</div><div className="legacy-entity-icon">{icon ?? <span>?</span>}</div><div className="legacy-entity-title"><strong>{title}</strong>{subtitle&&<span>{subtitle}</span>}</div>{onPin&&<button className={`legacy-pin ${pinned?"is-pinned":""}`} type="button" onClick={onPin} aria-label="固定"><span>📌</span></button>}</header>;
}

export function PropertyRow({ label, description, changed, children, onCopy }: { label:string; description?:string; changed?:boolean; children:ReactNode; onCopy?:()=>void }) {
  const rowId = useId();
  return <div id={rowId} className={`legacy-property-row ${changed?"is-changed":""}`}><div className="legacy-property-label">{onCopy&&<button type="button" className="legacy-copy" onClick={onCopy} aria-label="复制">↩</button>}<div><strong>{label}</strong>{description&&<span>{description}</span>}</div></div><div className="legacy-property-value">{children}</div>{changed&&<span className="legacy-changed">已修改</span>}</div>;
}

export function LegacyDialog({ open, title, children, onClose }: { open:boolean; title:string; children:ReactNode; onClose:()=>void }) {
  if (!open) return null;
  return <div className="legacy-dialog-layer" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target) onClose()}}><section className="legacy-dialog legacy-dialog-in" role="dialog" aria-modal="true"><header><strong>{title}</strong><button type="button" onClick={onClose}><X size={18}/></button></header><div className="legacy-dialog-body">{children}</div></section></div>;
}

/** @deprecated Use EntityHeader. Kept as a compatibility alias for Rulesmd-specific code. */
export function FactionHeader({ tone="allied", icon, name, subtitle, code, pinned=false, onPin }: { tone?:"allied"|"soviet"|"yuri"|"preview"; icon?:ReactNode; name:string; subtitle?:string; code?:string; pinned?:boolean; onPin?:()=>void }) {
  const toneMap = { allied:"blue", soviet:"red", yuri:"purple", preview:"neutral" } as const;
  return <EntityHeader tone={toneMap[tone]} icon={icon} title={name} subtitle={subtitle} watermark={code} pinned={pinned} onPin={onPin}/>;
}

/** @deprecated Use MultiSelect with a project-specific title. */
export function SideSelect(props: Omit<React.ComponentProps<typeof MultiSelect>,"title"> & { title?:string }) {
  return <MultiSelect {...props} title={props.title ?? "选择项目"}/>;
}
