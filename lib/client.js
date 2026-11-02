window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var A=Object.defineProperty;var he=Object.getOwnPropertyDescriptor;var be=Object.getOwnPropertyNames;var xe=Object.prototype.hasOwnProperty;var ve=(e,t)=>{for(var n in t)A(e,n,{get:t[n],enumerable:!0})},we=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of be(t))!xe.call(e,i)&&i!==n&&A(e,i,{get:()=>t[i],enumerable:!(o=he(t,i))||o.enumerable});return e};var Ee=e=>we(A({},"__esModule",{value:!0}),e);var Qe={};ve(Qe,{boot:()=>$e,clientPlugin:()=>le,default:()=>Ze});module.exports=Ee(Qe);var H=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function K(e){return e.meta||e.alt||e.ctrl||e.shift}function ke(e){return e.length>1&&!H.includes(e)}var Se={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},Re={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},Be={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},Je={" ":"Space"};function J(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function g(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t}}}function N(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function R(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function B(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!N(e))return t;let o=e.key;return typeof o!="string"||o.length===0?t:{key:o.length===1?o.toLowerCase():o,meta:R(e,"meta"),alt:R(e,"alt"),ctrl:R(e,"ctrl"),shift:R(e,"shift")}}function j(e,t="macos"){let n=g(t),o=N(e)?e:{};return{click:B(o.click,n.click,t),focus:B(o.focus,n.focus,t)}}function w(e,t){return e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function F(e,t){return H.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!ke(e.key)?"no-modifier":t.some(o=>w(o,e))?"duplicate":null}function h(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function Te(e,t){let o=(t==="macos"?Be:Je)[e];return o!==void 0?o:e.length===1?e.toUpperCase():e}function P(e,t){let o=["ctrl","alt","shift","meta"].filter(a=>e[a]).map(a=>t==="macos"?Se[a]:Re[a]);return o.push(Te(e.key,t)),t==="macos"?o.join(""):o.join("+")}var b=["a","s","d","f","g","h","j","k","l"],Ce=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],L=["textbox","searchbox"],Ae=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...Ce.map(e=>`[role=${e}]`),...L.map(e=>`[role=${e}]`)].join(", "),G={candidateSelector:Ae};function*Ke(e=1){if(e<=1){yield*b;return}let t=[...b];for(let n=1;n<e;n+=1){let o=[];for(let i of t){let a=i[i.length-1];if(a===void 0)break;for(let r of b)r!==a&&o.push(i+r);o.push(i+a)}t=o}yield*t}var Y=b.length;function je(e){let t=1,n=Y;for(;e>n;)t+=1,n*=Y;return t}function z(e,t,n){let o=[];for(let r of e()){let s=r.getBoundingClientRect();s.width>0&&s.height>0&&s.x<t.width&&s.x+s.width>0&&s.y<t.height&&s.y+s.height>0&&n.isVisible(r)&&o.push({element:r,rect:{x:s.x,y:s.y,w:s.width,h:s.height}})}let i=o.filter(({element:r})=>!o.some(s=>s.element!==r&&r.contains(s.element))),a=Ke(je(i.length));return i.map(r=>{let s=a.next();if(s.done)throw new Error("dsh-jump: label space exhausted");return{element:r.element,label:s.value,rect:r.rect}})}function W(){return{mode:"idle",pending:""}}function D(e){e.mode="idle",e.pending=""}function V(e,t,n,o){if(e.mode==="idle")return h(t,o.click)?(e.mode="click",e.pending="",{type:"activate-click"}):h(t,o.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):{type:"ignore"};if(t.key==="Escape")return D(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return D(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(h(t,o.click)||h(t,o.focus))return D(e),{type:"exit"};if(!b.includes(t.key))return e.pending="",{type:"ignore"};let i=e.pending+t.key;return n.includes(i)?(e.pending="",{type:"label",key:t.key}):n.some(a=>a.length>i.length&&a.startsWith(i))?(e.pending=i,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function q(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),o;function i(){if(o!==void 0)return o;let r=t.createElement("div");return r.dataset.dshJumpOverlay="",r.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(r),o=r,r}function a(r,s){let c=t.createElement("div");c.dataset.jumpLabel=r.label,c.textContent=r.label;let{width:u,height:m}=n(),l=Math.min(Math.max(r.rect.x,0),Math.max(u-24,0)),d=Math.min(Math.max(r.rect.y,0),Math.max(m-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(l))+"px;top:"+String(Math.round(d))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(s?"1":"0.3"),c}return{render(r,s=""){i().replaceChildren(...r.map(u=>a(u,u.label.startsWith(s))))},destroy(){o?.remove(),o=void 0}}}var Pe=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Le=new Set(["TEXTAREA"]);function U(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function I(e){if(U(e))return"focus";let t=e.tagName;if(t==="INPUT"){let o=(e.getAttribute("type")??"text").trim().toLowerCase();return Pe.has(o)?"focus":"click"}if(Le.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&L.includes(n.trim().toLowerCase())?"focus":"click"}function X(e){if(e===null)return!1;if(I(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if(U(t))return!0;return!1}function De(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function Ie(e,t,n){let o=e.ownerDocument?.defaultView;if(o==null)return;let i=(s,c)=>new o.MouseEvent(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),a=o.PointerEvent,r=(s,c)=>a===void 0?i(s,c):new a(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(r("pointerdown",1)),e.dispatchEvent(i("mousedown",1)),e.dispatchEvent(r("pointerup",0)),e.dispatchEvent(i("mouseup",0)),e.dispatchEvent(i("click",0))}function Oe(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let o=t.getSelection?.()??null;if(o===null)return;let i=t.createRange();i.selectNodeContents(e),i.collapse(!1),o.removeAllRanges(),o.addRange(i)}function _e(){return globalThis.navigator?.platform??""}function $(e={}){let t=e.window??globalThis,n={...G,...e.config},o=e.isVisible??De,i=e.platform??J(_e()),a=g(i),r=e.bindings??{get:()=>a},s=e.onRound??(()=>{}),c=q({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function u(){let l=t.document.activeElement;l===null||l===t.document.body||l===t.document.documentElement||typeof l.blur=="function"&&l.blur()}function m(){u();let l=z(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:o});return c.render(l),l}return{apply(){let l=W(),d=[],y=!1,T=()=>{y||(y=!0,s("begin"))},E=()=>{y&&(y=!1,s("end"))},k=p=>{let S=r.get(),ue=h(p,S.click)&&!K(S.click)||h(p,S.focus)&&!K(S.focus);if(l.mode==="idle"&&ue&&X(t.document.activeElement))return;let C=l.pending,de={key:p.key,metaKey:p.metaKey,ctrlKey:p.ctrlKey,altKey:p.altKey,shiftKey:p.shiftKey,isComposing:p.isComposing},pe=l.mode!=="idle",x=V(l,de,d.map(v=>v.label),S);if((pe||x.type!=="ignore")&&(p.preventDefault(),p.stopPropagation()),x.type==="ignore"){l.pending!==C&&c.render(d,l.pending);return}if(x.type==="activate-click"||x.type==="activate-focus"){T(),d=m();return}if(x.type==="exit"){d=[],c.destroy(),E();return}if(l.pending!==C&&c.render(d,l.pending),l.pending!=="")return;let me=C+x.key,f=d.find(v=>v.label===me);d=[],c.destroy(),E();let fe=l.mode;if(l.mode="idle",f===void 0)return;let ge=f.rect.x+f.rect.w/2,ye=f.rect.y+f.rect.h/2;if(I(f.element)==="focus")Oe(f.element,t.document);else if(fe==="click")Ie(f.element,ge,ye);else{let v=f.element;typeof v.focus=="function"&&v.focus()}};return t.addEventListener("keydown",k,{capture:!0}),()=>{t.removeEventListener("keydown",k,{capture:!0}),c.destroy(),d=[],E()}}}}var Me="/api/dsh-jump/ime";function Z(e,t=globalThis.fetch.bind(globalThis)){t(Me,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({op:e})}).catch(()=>{})}var He={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9009\u4E2D\u540E\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},Ne={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"The selected target only receives focus.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function O(e){return e.toLowerCase().startsWith("en")?Ne:He}var Fe=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function Q(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(Fe.has(e.key)||e.isComposing)return{status:"pending"};let o=B({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),i=F(o,t);return i!==null?{status:"rejected",issue:i}:{status:"accepted",binding:o}}function Ge(e,t){return[t==="click"?e.focus:e.click]}function ee(e){let{store:t,platform:n}=e,o=new Set,i={bindings:t.get(),recording:null,issue:null},a=r=>{if(!(r.bindings===i.bindings&&r.recording===i.recording&&r.issue===i.issue)){i=r;for(let s of o)s(i)}};return t.subscribe(r=>{a({...i,bindings:r,issue:null})}),{getState:()=>i,begin(r){a({...i,recording:r,issue:null})},press(r){let s=i.recording;if(s===null)return"idle";let c=Q(r,Ge(i.bindings,s),n);return c.status==="pending"?"pending":c.status==="cancel"?(a({...i,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(a({...i,issue:c.issue}),"rejected"):(t.set({...i.bindings,[s]:c.binding}),a({...i,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),a({bindings:t.get(),recording:null,issue:null})},resetAction(r){let s=g(n),c=r==="click"?"focus":"click",u={...i.bindings,[r]:s[r]};w(u[r],u[c])&&(u[c]=s[c]),t.set(u),a({bindings:t.get(),recording:null,issue:null})},subscribe(r){return o.add(r),()=>{o.delete(r)}}}}function te(e,t,n){let o=e.useRef(n);o.current=n,e.useEffect(()=>{if(t===null)return;let i=r=>{r.preventDefault(),r.stopPropagation(),o.current(r)},a=globalThis.document;return a.addEventListener("keydown",i,{capture:!0}),()=>{a.removeEventListener("keydown",i,{capture:!0})}},[t])}var Ye=`
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
[data-dsh-jump-page] [data-dsh-jump-reset]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
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
`,ne="dsh-jump/page.css";function ie(e){let t=`style[data-plugin-css=${JSON.stringify(ne)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=ne,n.textContent=Ye,e.head.append(n),()=>n.remove()}function oe(e){let{React:t,action:n,controller:o,platform:i,copy:a,title:r,description:s,name:c}=e,u=t.useSyncExternalStore(y=>o.subscribe(()=>y()),()=>o.getState()),m=u.recording===n,l=P(u.bindings[n],i),d=P(g(i)[n],i);return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},r),t.createElement("p",{"data-dsh-jump-description":""},m?a.recordingHint:s)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":m?"":void 0,"aria-label":c,"aria-keyshortcuts":l,onClick:()=>{o.begin(n)}},m?a.recording:l),t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:l===d,onClick:()=>{o.resetAction(n)}},a.reset)))}function re(e){let{React:t,controller:n,platform:o,copy:i}=e,a=t.useSyncExternalStore(r=>n.subscribe(()=>r()),()=>n.getState());return te(t,a.recording,r=>{n.press({key:r.key,metaKey:r.metaKey,ctrlKey:r.ctrlKey,altKey:r.altKey,shiftKey:r.shiftKey,isComposing:r.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},i.title),t.createElement("p",{"data-dsh-jump-lede":""},i.description)),oe({React:t,action:"click",controller:n,platform:o,copy:i,title:i.clickTitle,description:i.clickDescription,name:i.clickName}),oe({React:t,action:"focus",controller:n,platform:o,copy:i,title:i.focusTitle,description:i.focusDescription,name:i.focusName}),a.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},i.issues[a.issue]),t.createElement("p",{"data-dsh-jump-note":""},i.bareNote))}var _="dsh-jump:bindings:v1";function ze(e,t){return w(e.click,t.click)&&w(e.focus,t.focus)}function We(){try{return globalThis.localStorage??null}catch{return null}}function se(e){let t=g(e.platform),n=e.storage===void 0?We():e.storage,o=new Set,i=()=>{if(n===null)return t;try{let s=n.getItem(_);return s===null?t:j(JSON.parse(s),e.platform)}catch{return t}},a=i(),r=s=>{if(!ze(a,s)){a=s;for(let c of o)c(a)}};return{get:()=>a,set(s){if(r(j(s,e.platform)),n!==null)try{n.setItem(_,JSON.stringify(a))}catch{}},reset(){if(r(t),n!==null)try{n.removeItem(_)}catch{}},reload(){r(i())},subscribe(s){return o.add(s),()=>{o.delete(s)}}}}var ae="settings.section",Ve="jump",qe=25;function ce(e){let{ctx:t,platform:n,React:o,config:i}=e,a=e.store??se({platform:n}),r=e.imeFetch,s=$({config:i,bindings:a,platform:n,window:e.window,onRound:u=>Z(u,r)}),c=[s.apply()];return o!==null&&c.push(t.inject(["slots"],u=>{let m=u.get("slots");if(m===void 0)return;let l=u.get("locale"),d=ee({store:a,platform:n}),y=()=>O(l?.getSnapshot().active??"zh").navLabel,T=()=>re({React:o,controller:d,platform:n,copy:O(l?.getSnapshot().active??"zh")}),E=m.inject(ae,()=>m.register({name:ae,id:Ve,order:qe,label:y},T)),k=e.document??globalThis.document,p=k===void 0?void 0:ie(k);return()=>{E(),p?.()}})),{store:a,app:s,dispose(){for(;c.length>0;)c.pop()?.()}}}var M=null;function Ue(){return J(globalThis.navigator?.platform??"")}function Xe(){if(M===null)return null;let e=M("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var le={name:"dsh-jump",inject:[],apply(e,t){let n=ce({ctx:e,platform:Ue(),React:Xe(),config:t});return()=>n.dispose()}};function $e(e){M=e}var Ze=le;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
