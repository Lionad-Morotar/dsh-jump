window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var D=Object.defineProperty;var Ee=Object.getOwnPropertyDescriptor;var ke=Object.getOwnPropertyNames;var we=Object.prototype.hasOwnProperty;var Se=(e,t)=>{for(var n in t)D(e,n,{get:t[n],enumerable:!0})},Te=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of ke(t))!we.call(e,i)&&i!==n&&D(e,i,{get:()=>t[i],enumerable:!(r=Ee(t,i))||r.enumerable});return e};var Je=e=>Te(D({},"__esModule",{value:!0}),e);var pt={};Se(pt,{boot:()=>ut,clientPlugin:()=>Re,default:()=>dt});module.exports=Je(pt);var G=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function J(e){return e.meta||e.alt||e.ctrl||e.shift}function Be(e){return e.length>1&&!G.includes(e)}var Ae={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},Ce={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},Ie={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},De={" ":"Space"};function B(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function v(e){return{click:{key:"h",alt:!1,shift:!1,...e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0}},focus:null,reference:null}}function U(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function T(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function A(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!U(e))return t;let r=e.key;return typeof r!="string"||r.length===0?t:{key:r.length===1?r.toLowerCase():r,meta:T(e,"meta"),alt:T(e,"alt"),ctrl:T(e,"ctrl"),shift:T(e,"shift")}}function j(e,t="macos"){let n=v(t),r=U(e)?e:{};return{click:A(r.click,n.click,t),focus:F(r.focus,t),reference:F(r.reference,t)}}function F(e,t){if(e==null)return null;let r=A(e,{key:"",meta:!1,alt:!1,ctrl:!1,shift:!1},t);return r.key===""?null:r}function E(e,t){return e===null||t===null?e===t:e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function $(e,t){return G.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!Be(e.key)?"no-modifier":t.some(r=>E(r,e))?"duplicate":null}function R(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function je(e,t){let r=(t==="macos"?Ie:De)[e];return r!==void 0?r:e.length===1?e.toUpperCase():e}function L(e,t){let r=["ctrl","alt","shift","meta"].filter(s=>e[s]).map(s=>t==="macos"?Ae[s]:Ce[s]);return r.push(je(e.key,t)),t==="macos"?r.join(""):r.join("+")}var k=["a","s","d","f","g","h","j","k","l"],Le=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],K=["textbox","searchbox"],Ke=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...Le.map(e=>`[role=${e}]`),...K.map(e=>`[role=${e}]`)].join(", "),z={candidateSelector:Ke};function*Pe(e=1){if(e<=1){yield*k;return}let t=[...k];for(let n=1;n<e;n+=1){let r=[];for(let i of t){let s=i[i.length-1];if(s===void 0)break;for(let o of k)o!==s&&r.push(i+o);r.push(i+s)}t=r}yield*t}var Y=k.length;function Oe(e){let t=1,n=Y;for(;e>n;)t+=1,n*=Y;return t}function W(e,t,n){let r=[];for(let o of e()){let a=o.getBoundingClientRect();a.width>0&&a.height>0&&a.x<t.width&&a.x+a.width>0&&a.y<t.height&&a.y+a.height>0&&n.isVisible(o)&&r.push({element:o,rect:{x:a.x,y:a.y,w:a.width,h:a.height}})}let i=r.filter(({element:o})=>!r.some(a=>a.element!==o&&o.contains(a.element))),s=Pe(Oe(i.length));return i.map(o=>{let a=s.next();if(a.done)throw new Error("dsh-jump: label space exhausted");return{element:o.element,label:a.value,rect:o.rect}})}function V(){return{mode:"idle",pending:""}}function P(e){e.mode="idle",e.pending=""}function q(e,t,n,r){if(e.mode==="idle")return R(t,r.click)?(e.mode="click",e.pending="",{type:"activate-click"}):r.focus!==null&&R(t,r.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):r.reference!==null&&R(t,r.reference)?(e.mode="reference",e.pending="",{type:"activate-reference"}):{type:"ignore"};if(t.key==="Escape")return P(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return P(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(R(t,r.click)||r.focus!==null&&R(t,r.focus)||r.reference!==null&&R(t,r.reference))return P(e),{type:"exit"};if(!k.includes(t.key))return e.pending="",{type:"ignore"};let i=e.pending+t.key;return n.includes(i)?(e.pending="",{type:"label",key:t.key}):n.some(s=>s.length>i.length&&s.startsWith(i))?(e.pending=i,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function X(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),r;function i(){if(r!==void 0)return r;let o=t.createElement("div");return o.dataset.dshJumpOverlay="",o.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(o),r=o,o}function s(o,a){let c=t.createElement("div");c.dataset.jumpLabel=o.label,c.textContent=o.label;let{width:u,height:p}=n(),f=Math.min(Math.max(o.rect.x,0),Math.max(u-24,0)),l=Math.min(Math.max(o.rect.y,0),Math.max(p-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(f))+"px;top:"+String(Math.round(l))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(a?"1":"0.3"),c}return{render(o,a=""){i().replaceChildren(...o.map(u=>s(u,u.label.startsWith(a))))},destroy(){r?.remove(),r=void 0}}}var _e=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Ne=new Set(["TEXTAREA"]);function Z(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function O(e){if(Z(e))return"focus";let t=e.tagName;if(t==="INPUT"){let r=(e.getAttribute("type")??"text").trim().toLowerCase();return _e.has(r)?"focus":"click"}if(Ne.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&K.includes(n.trim().toLowerCase())?"focus":"click"}function Q(e){if(e===null)return!1;if(O(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if(Z(t))return!0;return!1}function Me(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function He(e,t,n){let r=e.ownerDocument?.defaultView;if(r==null)return;let i=(a,c)=>new r.MouseEvent(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),s=r.PointerEvent,o=(a,c)=>s===void 0?i(a,c):new s(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(o("pointerdown",1)),e.dispatchEvent(i("mousedown",1)),e.dispatchEvent(o("pointerup",0)),e.dispatchEvent(i("mouseup",0)),e.dispatchEvent(i("click",0))}function Fe(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let r=t.getSelection?.()??null;if(r===null)return;let i=t.createRange();i.selectNodeContents(e),i.collapse(!1),r.removeAllRanges(),r.addRange(i)}function Ge(){return globalThis.navigator?.platform??""}function ee(e={}){let t=e.window??globalThis,n={...z,...e.config},r=e.isVisible??Me,i=e.platform??B(Ge()),s=v(i),o=e.bindings??{get:()=>s},a=X({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function c(){let u=W(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:r});return a.render(u),u}return{apply(){let u=V(),p=[],f=l=>{let d=o.get(),b=R(l,d.click)&&!J(d.click)||d.focus!==null&&R(l,d.focus)&&!J(d.focus)||d.reference!==null&&R(l,d.reference)&&!J(d.reference);if(u.mode==="idle"&&b&&Q(t.document.activeElement))return;let h=u.pending,x={key:l.key,metaKey:l.metaKey,ctrlKey:l.ctrlKey,altKey:l.altKey,shiftKey:l.shiftKey,isComposing:l.isComposing},y=u.mode!=="idle",m=q(u,x,p.map(w=>w.label),d);if((y||m.type!=="ignore")&&(l.preventDefault(),l.stopPropagation()),m.type==="ignore"){u.pending!==h&&a.render(p,u.pending);return}if(m.type==="activate-click"||m.type==="activate-focus"||m.type==="activate-reference"){p=c();return}if(m.type==="exit"){p=[],a.destroy();return}if(u.pending!==h&&a.render(p,u.pending),u.pending!=="")return;let C=h+m.key,g=p.find(w=>w.label===C);p=[],a.destroy();let S=u.mode;if(u.mode="idle",g===void 0)return;let I=g.rect.x+g.rect.w/2,ve=g.rect.y+g.rect.h/2;if(S==="reference"){e.onReference?.(g.element);return}if(O(g.element)==="focus")Fe(g.element,t.document);else if(S==="click")He(g.element,I,ve);else{let w=g.element;typeof w.focus=="function"&&w.focus()}};return t.addEventListener("keydown",f,{capture:!0}),()=>{t.removeEventListener("keydown",f,{capture:!0}),a.destroy(),p=[]}}}}var Ue={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9ED8\u8BA4\u672A\u542F\u7528\u3002\u5F55\u5236\u4E00\u4E2A\u548C\u5F26\u540E\uFF0C\u9009\u4E2D\u76EE\u6807\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",focusDisabled:"\u672A\u542F\u7528",focusDisable:"\u5173\u95ED\u805A\u7126\u6A21\u5F0F",referenceTitle:"\u5F15\u7528\u6A21\u5F0F",referenceDescription:"\u9009\u4E2D\u540E\u628A\u8BE5\u5143\u7D20\u4F5C\u4E3A\u5F15\u7528\u63D2\u5165\u8F93\u5165\u6846\uFF0C\u4E0D\u70B9\u51FB\u4E5F\u4E0D\u79FB\u52A8\u7126\u70B9\u3002",referenceDisabled:"\u672A\u542F\u7528",referenceDisable:"\u5173\u95ED\u5F15\u7528\u6A21\u5F0F",referenceNeedsSession:"\u9700\u8981\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u5F15\u7528\u8981\u63D2\u8FDB\u5B83\u7684\u8F93\u5165\u6846\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",referenceName:"\u5F15\u7528\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},$e={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"Off by default. Record a shortcut and the selected target only receives focus.",focusDisabled:"Off",focusDisable:"Turn off focus mode",referenceTitle:"Reference mode",referenceDescription:"The selected element is inserted into the composer as a reference; nothing is clicked and focus does not move.",referenceDisabled:"Off",referenceDisable:"Turn off reference mode",referenceNeedsSession:"Open a session first: the reference is inserted into its composer.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",referenceName:"Reference-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function _(e){return e.toLowerCase().startsWith("en")?$e:Ue}var ze=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function te(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(ze.has(e.key)||e.isComposing)return{status:"pending"};let r=A({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),i=$(r,t);return i!==null?{status:"rejected",issue:i}:{status:"accepted",binding:r}}function Ye(e,t){let n=["click","focus","reference"].filter(i=>i!==t),r=[];for(let i of n){let s=e[i];s!==null&&r.push(s)}return r}function ne(e){let{store:t,platform:n}=e,r=new Set,i={bindings:t.get(),recording:null,issue:null},s=o=>{if(!(o.bindings===i.bindings&&o.recording===i.recording&&o.issue===i.issue)){i=o;for(let a of r)a(i)}};return t.subscribe(o=>{s({...i,bindings:o,issue:null})}),{getState:()=>i,begin(o){s({...i,recording:o,issue:null})},press(o){let a=i.recording;if(a===null)return"idle";let c=te(o,Ye(i.bindings,a),n);return c.status==="pending"?"pending":c.status==="cancel"?(s({...i,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(s({...i,issue:c.issue}),"rejected"):(t.set({...i.bindings,[a]:c.binding}),s({...i,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),s({bindings:t.get(),recording:null,issue:null})},resetAction(o){if(o!=="click"){t.set({...i.bindings,[o]:null}),s({bindings:t.get(),recording:null,issue:null});return}let a=v(n),c={...i.bindings,click:a.click};for(let u of["focus","reference"])E(c.click,c[u])&&(c[u]=a[u]);t.set(c),s({bindings:t.get(),recording:null,issue:null})},disableAction(o){o!=="click"&&(t.set({...i.bindings,[o]:null}),s({bindings:t.get(),recording:null,issue:null}))},subscribe(o){return r.add(o),()=>{r.delete(o)}}}}function re(e,t,n){let r=e.useRef(n);r.current=n,e.useEffect(()=>{if(t===null)return;let i=o=>{o.preventDefault(),o.stopPropagation(),r.current(o)},s=globalThis.document;return s.addEventListener("keydown",i,{capture:!0}),()=>{s.removeEventListener("keydown",i,{capture:!0})}},[t])}var We=`
[data-dsh-jump-page] {
  display: flex;
  flex-direction: column;
  width: 100%;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-head] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-heading] {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}
[data-dsh-jump-page] [data-dsh-jump-lede] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-mode] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 60px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
[data-dsh-jump-page] [data-dsh-jump-mode]:last-of-type {
  border-bottom: none;
}
[data-dsh-jump-page] [data-dsh-jump-text] {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
[data-dsh-jump-page] [data-dsh-jump-title] {
  font-size: 14px;
  line-height: 22px;
}
[data-dsh-jump-page] [data-dsh-jump-description] {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-actions] {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}
[data-dsh-jump-page] [data-dsh-jump-chord] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  white-space: nowrap;
}
[data-dsh-jump-page] [data-dsh-jump-chord]:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-jump-page] [data-dsh-jump-chord][data-recording] {
  outline: 1px solid var(--dsw-alias-label-primary);
  outline-offset: -1px;
}
[data-dsh-jump-page] [data-dsh-jump-disable],
[data-dsh-jump-page] [data-dsh-jump-reset] {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
[data-dsh-jump-page] [data-dsh-jump-disable]:hover:not(:disabled),
[data-dsh-jump-page] [data-dsh-jump-reset]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
[data-dsh-jump-page] [data-dsh-jump-disable]:disabled,
[data-dsh-jump-page] [data-dsh-jump-reset]:disabled {
  cursor: default;
  opacity: 0.45;
}
[data-dsh-jump-page] [data-dsh-jump-issue] {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
[data-dsh-jump-page] [data-dsh-jump-note] {
  margin: 0;
  padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
`,ie="dsh-jump/page.css";function oe(e){let t=`style[data-plugin-css=${JSON.stringify(ie)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=ie,n.textContent=We,e.head.append(n),()=>n.remove()}function N(e){let{React:t,action:n,controller:r,platform:i,copy:s,title:o,description:a,name:c}=e,u=t.useSyncExternalStore(m=>r.subscribe(()=>m()),()=>r.getState()),p=u.recording===n,f=u.bindings[n],l=f===null?null:L(f,i),d=v(i)[n],b=d===null?null:L(d,i),h=n!=="click",x=n==="focus"?s.focusDisabled:s.referenceDisabled,y=n==="focus"?s.focusDisable:s.referenceDisable;return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},o),t.createElement("p",{"data-dsh-jump-description":""},p?s.recordingHint:a)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":p?"":void 0,"aria-label":c,...l===null?{}:{"aria-keyshortcuts":l},onClick:()=>{r.begin(n)}},p?s.recording:l??x),h?t.createElement("button",{type:"button","data-dsh-jump-disable":n,disabled:f===null,onClick:()=>{r.disableAction(n)}},y):null,t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:l===b,onClick:()=>{r.resetAction(n)}},s.reset)))}function se(e){let{React:t,controller:n,platform:r,copy:i}=e,s=t.useSyncExternalStore(o=>n.subscribe(()=>o()),()=>n.getState());return re(t,s.recording,o=>{n.press({key:o.key,metaKey:o.metaKey,ctrlKey:o.ctrlKey,altKey:o.altKey,shiftKey:o.shiftKey,isComposing:o.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},i.title),t.createElement("p",{"data-dsh-jump-lede":""},i.description)),N({React:t,action:"click",controller:n,platform:r,copy:i,title:i.clickTitle,description:i.clickDescription,name:i.clickName}),N({React:t,action:"focus",controller:n,platform:r,copy:i,title:i.focusTitle,description:i.focusDescription,name:i.focusName}),N({React:t,action:"reference",controller:n,platform:r,copy:i,title:i.referenceTitle,description:i.referenceDescription,name:i.referenceName}),s.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},i.issues[s.issue]),t.createElement("p",{"data-dsh-jump-note":""},i.bareNote))}var M="dsh-jump:bindings:v1";function Ve(e,t){return E(e.click,t.click)&&E(e.focus,t.focus)&&E(e.reference,t.reference)}function qe(){try{return globalThis.localStorage??null}catch{return null}}function ae(e){let t=v(e.platform),n=e.storage===void 0?qe():e.storage,r=new Set,i=()=>{if(n===null)return t;try{let a=n.getItem(M);return a===null?t:j(JSON.parse(a),e.platform)}catch{return t}},s=i(),o=a=>{if(!Ve(s,a)){s=a;for(let c of r)c(s)}};return{get:()=>s,set(a){if(o(j(a,e.platform)),n!==null)try{n.setItem(M,JSON.stringify(s))}catch{}},reset(){if(o(t),n!==null)try{n.removeItem(M)}catch{}},reload(){o(i())},subscribe(a){return r.add(a),()=>{r.delete(a)}}}}var ce="lionad.jump";var Xe=/^(?:css-|sc-|jsx-|_|svelte-|emotion-)/u,Ze=new Set(["flex","grid","block","inline","hidden","relative","absolute","static","sticky","fixed","container","row","col","wrap","grow","shrink","truncate","sr-only","active","disabled","selected","focused","open","closed"]);function Qe(e){return e===""||Ze.has(e)||Xe.test(e)?!1:e.includes("-")||e.includes("_")}function et(e){let t=e.replace(/\s+/gu," ").trim();return t.length<=80?t:`${t.slice(0,79).trimEnd()}\u2026`}function le(e){let t=e.tagName.toLowerCase(),n=e.getAttribute("id")?.trim()??"",r=e.getAttribute("data-testid")?.trim()??"",i=e.getAttribute("role")?.trim()??"",s=e.getAttribute("aria-label")?.trim()??"",o=Array.from(e.classList).filter(Qe).slice(0,3),a=et(e.textContent??"");return{kind:"ui.element",tag:t,...n===""?{}:{id:n},...r===""?{}:{testId:r},...o.length===0?{}:{classes:o},...i===""?{}:{role:i},...s===""?{}:{ariaLabel:s},...a===""?{}:{text:a}}}function ue(e){return e.testId!==void 0?`${e.tag}[data-testid=${e.testId}]`:e.id!==void 0?`${e.tag}#${e.id}`:e.tag}function tt(e){return e.ariaLabel!==void 0?e.ariaLabel:e.text!==void 0?e.text:e.classes?.[0]}function de(e){let t=[`[ui element] <${e.tag}>`];return e.testId!==void 0&&t.push(`data-testid="${e.testId}"`),e.id!==void 0&&t.push(`id="${e.id}"`),e.role!==void 0&&t.push(`role=${e.role}`),e.ariaLabel!==void 0&&t.push(`aria-label="${e.ariaLabel}"`),e.classes!==void 0&&e.classes.length>0&&t.push(`class="${e.classes.join(" ")}"`),e.text!==void 0&&t.push(`text="${e.text}"`),t.join(" ")}function pe(e){let t=ue(e),n=tt(e);return{kind:"ui.element",id:t,label:n===void 0?e.tag:`${e.tag}\u300C${n}\u300D`,clipboardText:`[ui element ${t}]`,modelText:de(e),ref:JSON.stringify(e)}}function fe(e){let t;try{t=JSON.parse(e)}catch{return}if(t===null||typeof t!="object")return;let n=t;if(!(typeof n.tag!="string"||n.tag===""))return{kind:"ui.element",tag:n.tag,...typeof n.id=="string"?{id:n.id}:{},...typeof n.testId=="string"?{testId:n.testId}:{},...Array.isArray(n.classes)?{classes:n.classes.filter(r=>typeof r=="string")}:{},...typeof n.role=="string"?{role:n.role}:{},...typeof n.ariaLabel=="string"?{ariaLabel:n.ariaLabel}:{},...typeof n.text=="string"?{text:n.text}:{}}}function nt(e){let t=fe(e);return t===void 0?`[ui element ${e}]`:`[ui element ${ue(t)}]`}function rt(e){let t=fe(e);return t===void 0?`[ui element ${e}]`:de(t)}function me(e,t){let n={source:ce,ref:t.ref,label:t.label,clipboardText:t.clipboardText,appearance:"session"};if(e.canInsertReference){let i=e.captureSpan();if(i!==void 0){if(e.insertReference(n,i))return"reference";let s=e.captureSpan();if(s!==void 0&&e.insertReference(n,s))return"reference"}}let r=e.captureSpan();return r===void 0?"failed":e.insertText(t.clipboardText,r)?"text":"failed"}function ge(e,t){return function(r){let i=r??{},s=i.sessionId??null,o=i.inputActions??null,a=e.useRef({sessionId:s,inputActions:o});a.current={sessionId:s,inputActions:o};let c=o!==null;return e.useEffect(()=>{t({sessionId:s,inputActions:a.current.inputActions})},[s,c]),null}}function ye(){return{trigger:"@",name:ce,showGroupTitle:!1,async candidates(){return[]},onPick(){},codec:{clipboardText:nt,async serialize(e){return rt(e)}}}}var be="settings.section",it="jump",ot=25,he="conversation.input.overlay",st="jump.session-bridge",at=95;function xe(e){let{ctx:t,platform:n,React:r,config:i}=e,s=e.store??ae({platform:n}),o={state:{sessionId:null,inputActions:null}},a={registered:!1},c=f=>{let{sessionId:l,inputActions:d}=o.state;if(l===null||d===null)return"no-session";let b;try{let x=t.get("sessions"),y=t.get("conversation"),m=x?.scope?.(l);if(m===void 0||y?.input?.for===void 0)return"no-session";b=y.input.for(m)}catch{return"no-session"}if(b==null)return"no-session";let h=me({captureSpan:()=>d.captureInsertion?.(),insertReference:(x,y)=>b?.insertReference?.(x,y)??!1,insertText:(x,y)=>d.insertText?.(x,y)??!1,canInsertReference:a.registered},pe(le(f)));return(h==="reference"||h==="text")&&b.focus?.(),h},u=ee({config:i,bindings:s,platform:n,window:e.window,onReference:f=>{c(f)}}),p=[u.apply()];return typeof t.inject=="function"&&p.push(t.inject(["inputTriggers"],f=>{let l=f.get("inputTriggers");if(l===void 0)return;let d=l.registerSource(ye());return a.registered=!0,()=>{d(),a.registered=!1}})),r!==null&&p.push(t.inject(["slots"],f=>{let l=f.get("slots");if(l===void 0)return;let d=f.get("locale"),b=ne({store:s,platform:n}),h=()=>_(d?.getSnapshot().active??"zh").navLabel,x=()=>se({React:r,controller:b,platform:n,copy:_(d?.getSnapshot().active??"zh")}),y=l.inject(be,()=>l.register({name:be,id:it,order:ot,label:h},x)),m=ge(r,I=>{o.state=I}),C=l.inject(he,()=>l.register({name:he,id:st,order:at},m)),g=e.document??globalThis.document,S=g===void 0?void 0:oe(g);return()=>{y(),C(),S?.()}})),{store:s,app:u,dispose(){for(;p.length>0;)p.pop()?.()}}}var H=null;function ct(){return B(globalThis.navigator?.platform??"")}function lt(){if(H===null)return null;let e=H("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var Re={name:"dsh-jump",inject:[],apply(e,t){let n=xe({ctx:e,platform:ct(),React:lt(),config:t});return()=>n.dispose()}};function ut(e){H=e}var dt=Re;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
