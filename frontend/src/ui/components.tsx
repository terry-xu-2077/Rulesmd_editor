import React, { ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import "./legacy-tokens.css";
import "./legacy-motion.css";
import "./components.css";

export type LegacyOption = { value: string; label?: string; group?: string };
export type FactionTone = "allied" | "soviet" | "yuri" | "preview";

export function LegacyTooltip({ text, children }: { text?: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return <span className="ra2-tooltip-host">{children}<span className="ra2-tooltip">{text}</span></span>;
}

export function ResetButton({ visible, onClick, label = "还原" }: { visible: boolean; onClick: () => void; label?: string }) {
  return <button type="button" className={`ra2-reset ${visible ? "is-visible" : ""}`} onClick={onClick} aria-label={label}><RotateCcw size={16}/><span>{label}</span></button>;
}

export function TextField({ value, rawValue, onChange, placeholder, tooltip, disabled }: { value: string; rawValue?: string; onChange: (v: string) => void; placeholder?: string; tooltip?: string; disabled?: boolean }) {
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="ra2-control-wrap"><LegacyTooltip text={tooltip}><div className="ra2-control ra2-text"><input value={value} disabled={disabled} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/></div></LegacyTooltip>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function BoolSwitch({ value, rawValue, onChange, trueValue = "yes", falseValue = "no", disabled }: { value: string; rawValue?: string; onChange:(v:string)=>void; trueValue?: string; falseValue?: string; disabled?:boolean }) {
  const on = value.toLowerCase() === trueValue.toLowerCase();
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="ra2-control-wrap"><button type="button" disabled={disabled} className={`ra2-control ra2-bool ${on ? "is-on" : ""}`} onClick={()=>onChange(on ? falseValue : trueValue)}><span className="ra2-bool-knob">{on ? "ON 开" : "OFF 关"}</span></button>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
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
  return <div className="ra2-control-wrap" ref={ref}><LegacyTooltip text={tooltip}><div className={`ra2-control ra2-select ${open?"is-open":""}`}><button disabled={disabled} type="button" className="ra2-select-button" onClick={()=>setOpen(v=>!v)}><span>{selected?.label ?? value}</span><ChevronDown size={20}/></button>{open && <div className="ra2-pop ra2-select-list legacy-pop-in">{options.map(o=><button type="button" key={o.value} className="ra2-select-item" onClick={()=>{onChange(o.value);setOpen(false)}}>{o.label ?? o.value}</button>)}</div>}</div></LegacyTooltip>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function Slider({ value, rawValue, min=0, max=100, step=1, onChange, disabled }: { value:number; rawValue?:number; min?:number; max?:number; step?:number; onChange:(v:number)=>void; disabled?:boolean }) {
  const changed = rawValue !== undefined && value !== rawValue;
  return <div className="ra2-control-wrap"><div className="ra2-control ra2-slider"><input className="ra2-range" disabled={disabled} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/><input className="ra2-number" disabled={disabled} type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></div>{rawValue !== undefined && <ResetButton visible={changed} onClick={()=>onChange(rawValue)}/>}</div>;
}

export function MultiSelect({ values, rawValues, options, onChange, title="选择项目", disabled }: { values:string[]; rawValues?:string[]; options:LegacyOption[]; onChange:(v:string[])=>void; title?:string; disabled?:boolean }) {
  const [open,setOpen] = useState(false);
  const ref = useOutsideClose(open, ()=>setOpen(false));
  const rawKey = rawValues?.join(","); const valueKey = values.join(",");
  const changed = rawValues !== undefined && rawKey !== valueKey;
  const labels = useMemo(()=>values.map(v=>options.find(o=>o.value===v)?.label ?? v).join(", "),[values,options]);
  const toggle=(v:string)=>onChange(values.includes(v)?values.filter(x=>x!==v):[...values,v]);
  return <div className="ra2-control-wrap" ref={ref}><div className="ra2-control ra2-multi"><button disabled={disabled} type="button" className="ra2-select-button" onClick={()=>setOpen(v=>!v)}><span>{labels || "未选择"}</span><ChevronDown size={20}/></button>{open && <div className="ra2-pop ra2-picker legacy-pop-in"><div className="ra2-picker-title">{title}</div><div className="ra2-picker-body">{options.map(o=><label className={`ra2-check-row ${o.group?"has-group":""}`} key={o.value}><input type="checkbox" checked={values.includes(o.value)} onChange={()=>toggle(o.value)}/><span className="ra2-check-box">{values.includes(o.value)&&<Check size={13}/>}</span><span>{o.label ?? o.value}</span>{o.group&&<em>{o.group}</em>}</label>)}</div><div className="ra2-picker-actions"><button type="button" onClick={()=>setOpen(false)}><Check size={15}/>确定</button><button type="button" onClick={()=>setOpen(false)}><X size={15}/>关闭</button></div></div>}</div>{rawValues && <ResetButton visible={changed} onClick={()=>onChange(rawValues)}/>}</div>;
}

export function SideSelect(props: Omit<React.ComponentProps<typeof MultiSelect>,"title"> & { title?:string }) {
  return <MultiSelect {...props} title={props.title ?? "选择所属阵营"}/>;
}

export function FactionHeader({ tone="allied", icon, name, subtitle, code, pinned=false, onPin }: { tone?:FactionTone; icon?:ReactNode; name:string; subtitle?:string; code?:string; pinned?:boolean; onPin?:()=>void }) {
  return <header className={`ra2-unit-header tone-${tone}`}><div className="ra2-unit-watermark">{code ?? name}</div><div className="ra2-unit-icon">{icon ?? <span>?</span>}</div><div className="ra2-unit-name"><strong>{name}</strong>{subtitle&&<span>{subtitle}</span>}</div>{onPin&&<button className={`ra2-pin ${pinned?"is-pinned":""}`} type="button" onClick={onPin} aria-label="固定"><span>📌</span></button>}</header>;
}

export function PropertyRow({ option, description, changed, children, onCopy }: { option:string; description?:string; changed?:boolean; children:ReactNode; onCopy?:()=>void }) {
  const rowId = useId();
  return <div id={rowId} className={`ra2-property-row ${changed?"is-changed":""}`}><div className="ra2-property-name">{onCopy&&<button type="button" className="ra2-copy" onClick={onCopy} aria-label="复制到左边">↩</button>}<div><strong>{option}</strong>{description&&<span>{description}</span>}</div></div><div className="ra2-property-value">{children}</div>{changed&&<span className="ra2-changed">已修改</span>}</div>;
}

export function LegacyDialog({ open, title, children, onClose }: { open:boolean; title:string; children:ReactNode; onClose:()=>void }) {
  if (!open) return null;
  return <div className="ra2-dialog-layer" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target) onClose()}}><section className="ra2-dialog legacy-dialog-in" role="dialog" aria-modal="true"><header><strong>{title}</strong><button type="button" onClick={onClose}><X size={18}/></button></header><div className="ra2-dialog-body">{children}</div></section></div>;
}
