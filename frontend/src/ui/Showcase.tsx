import React, { useState } from "react";
import { BoolSwitch, FactionHeader, LegacyDialog, MultiSelect, PropertyRow, Select, SideSelect, Slider, TextField } from "./index";
import "./showcase.css";

const baseOptions = [
  { value: "none", label: "无" },
  { value: "primary", label: "主武器" },
  { value: "secondary", label: "副武器" },
];
const sideOptions = [
  { value: "Americans", label: "美国", group: "盟军" },
  { value: "Alliance", label: "韩国", group: "盟军" },
  { value: "Russians", label: "苏联", group: "苏军" },
  { value: "YuriCountry", label: "尤里", group: "尤里" },
];

export function LegacyUiShowcase() {
  const [name,setName]=useState("GRIZZLY");
  const [bool,setBool]=useState("yes");
  const [weapon,setWeapon]=useState("primary");
  const [speed,setSpeed]=useState(7);
  const [sides,setSides]=useState(["Americans","Alliance"]);
  const [multi,setMulti]=useState(["primary"]);
  const [dialog,setDialog]=useState(false);
  const [pin,setPin]=useState(false);
  return <main className="ui-showcase">
    <div className="ui-showcase-shell">
      <FactionHeader tone="allied" name="灰熊坦克" subtitle="Allied Main Battle Tank" code="GRIZZLY" pinned={pin} onPin={()=>setPin(v=>!v)}/>
      <div className="ui-showcase-toolbar"><strong>Legacy UI Library</strong><button onClick={()=>setDialog(true)}>弹窗示例</button></div>
      <section className="ui-showcase-list">
        <PropertyRow option="Name" description="对象内部名称" changed={name!=="GRIZZLY"}><TextField value={name} rawValue="GRIZZLY" onChange={setName} tooltip="旧版默认文本输入控件"/></PropertyRow>
        <PropertyRow option="Primary" description="主武器" changed={weapon!=="primary"}><Select value={weapon} rawValue="primary" options={baseOptions} onChange={setWeapon}/></PropertyRow>
        <PropertyRow option="ImmuneToEMP" description="免疫 EMP" changed={bool!=="yes"}><BoolSwitch value={bool} rawValue="yes" onChange={setBool}/></PropertyRow>
        <PropertyRow option="Speed" description="移动速度" changed={speed!==7}><Slider value={speed} rawValue={7} min={1} max={20} onChange={setSpeed}/></PropertyRow>
        <PropertyRow option="Owner" description="所属阵营" changed={sides.join(",")!=="Americans,Alliance"}><SideSelect values={sides} rawValues={["Americans","Alliance"]} options={sideOptions} onChange={setSides}/></PropertyRow>
        <PropertyRow option="VeteranAbilities" description="老兵能力"><MultiSelect values={multi} rawValues={["primary"]} options={baseOptions} onChange={setMulti} title="选择能力"/></PropertyRow>
      </section>
    </div>
    <LegacyDialog open={dialog} title="旧版弹窗动效" onClose={()=>setDialog(false)}><p>此页面用于逐项核对旧 RulesmdEditorWeb 的视觉、尺寸、状态和动效。</p></LegacyDialog>
  </main>;
}
