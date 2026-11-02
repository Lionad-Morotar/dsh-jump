window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var K=Object.defineProperty;var ve=Object.getOwnPropertyDescriptor;var Ee=Object.getOwnPropertyNames;var we=Object.prototype.hasOwnProperty;var ke=(e,t)=>{for(var n in t)K(e,n,{get:t[n],enumerable:!0})},Se=(e,t,n,i)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of Ee(t))!we.call(e,o)&&o!==n&&K(e,o,{get:()=>t[o],enumerable:!(i=ve(t,o))||i.enumerable});return e};var Re=e=>Se(K({},"__esModule",{value:!0}),e);var nt={};ke(nt,{boot:()=>et,clientPlugin:()=>de,default:()=>tt});module.exports=Re(nt);var F=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function j(e){return e.meta||e.alt||e.ctrl||e.shift}function Je(e){return e.length>1&&!F.includes(e)}var Be={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},Te={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},Ce={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},Ae={" ":"Space"};function T(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function g(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t}}}function G(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function J(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function B(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!G(e))return t;let i=e.key;return typeof i!="string"||i.length===0?t:{key:i.length===1?i.toLowerCase():i,meta:J(e,"meta"),alt:J(e,"alt"),ctrl:J(e,"ctrl"),shift:J(e,"shift")}}function L(e,t="macos"){let n=g(t),i=G(e)?e:{};return{click:B(i.click,n.click,t),focus:B(i.focus,n.focus,t)}}function w(e,t){return e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function Y(e,t){return F.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!Je(e.key)?"no-modifier":t.some(i=>w(i,e))?"duplicate":null}function h(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function Ke(e,t){let i=(t==="macos"?Ce:Ae)[e];return i!==void 0?i:e.length===1?e.toUpperCase():e}function P(e,t){let i=["ctrl","alt","shift","meta"].filter(a=>e[a]).map(a=>t==="macos"?Be[a]:Te[a]);return i.push(Ke(e.key,t)),t==="macos"?i.join(""):i.join("+")}var x=["a","s","d","f","g","h","j","k","l"],je=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],I=["textbox","searchbox"],Le=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...je.map(e=>`[role=${e}]`),...I.map(e=>`[role=${e}]`)].join(", "),z={candidateSelector:Le};function*Pe(e=1){if(e<=1){yield*x;return}let t=[...x];for(let n=1;n<e;n+=1){let i=[];for(let o of t){let a=o[o.length-1];if(a===void 0)break;for(let r of x)r!==a&&i.push(o+r);i.push(o+a)}t=i}yield*t}var W=x.length;function Ie(e){let t=1,n=W;for(;e>n;)t+=1,n*=W;return t}function V(e,t,n){let i=[];for(let r of e()){let s=r.getBoundingClientRect();s.width>0&&s.height>0&&s.x<t.width&&s.x+s.width>0&&s.y<t.height&&s.y+s.height>0&&n.isVisible(r)&&i.push({element:r,rect:{x:s.x,y:s.y,w:s.width,h:s.height}})}let o=i.filter(({element:r})=>!i.some(s=>s.element!==r&&r.contains(s.element))),a=Pe(Ie(o.length));return o.map(r=>{let s=a.next();if(s.done)throw new Error("dsh-jump: label space exhausted");return{element:r.element,label:s.value,rect:r.rect}})}function q(){return{mode:"idle",pending:""}}function D(e){e.mode="idle",e.pending=""}function U(e,t,n,i){if(e.mode==="idle")return h(t,i.click)?(e.mode="click",e.pending="",{type:"activate-click"}):h(t,i.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):{type:"ignore"};if(t.key==="Escape")return D(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return D(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(h(t,i.click)||h(t,i.focus))return D(e),{type:"exit"};if(!x.includes(t.key))return e.pending="",{type:"ignore"};let o=e.pending+t.key;return n.includes(o)?(e.pending="",{type:"label",key:t.key}):n.some(a=>a.length>o.length&&a.startsWith(o))?(e.pending=o,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function X(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),i;function o(){if(i!==void 0)return i;let r=t.createElement("div");return r.dataset.dshJumpOverlay="",r.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(r),i=r,r}function a(r,s){let c=t.createElement("div");c.dataset.jumpLabel=r.label,c.textContent=r.label;let{width:u,height:p}=n(),l=Math.min(Math.max(r.rect.x,0),Math.max(u-24,0)),d=Math.min(Math.max(r.rect.y,0),Math.max(p-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(l))+"px;top:"+String(Math.round(d))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(s?"1":"0.3"),c}return{render(r,s=""){o().replaceChildren(...r.map(u=>a(u,u.label.startsWith(s))))},destroy(){i?.remove(),i=void 0}}}var De=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Oe=new Set(["TEXTAREA"]);function $(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function O(e){if($(e))return"focus";let t=e.tagName;if(t==="INPUT"){let i=(e.getAttribute("type")??"text").trim().toLowerCase();return De.has(i)?"focus":"click"}if(Oe.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&I.includes(n.trim().toLowerCase())?"focus":"click"}function Z(e){if(e===null)return!1;if(O(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if($(t))return!0;return!1}function _e(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function He(e,t,n){let i=e.ownerDocument?.defaultView;if(i==null)return;let o=(s,c)=>new i.MouseEvent(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),a=i.PointerEvent,r=(s,c)=>a===void 0?o(s,c):new a(s,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(r("pointerdown",1)),e.dispatchEvent(o("mousedown",1)),e.dispatchEvent(r("pointerup",0)),e.dispatchEvent(o("mouseup",0)),e.dispatchEvent(o("click",0))}function Me(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let i=t.getSelection?.()??null;if(i===null)return;let o=t.createRange();o.selectNodeContents(e),o.collapse(!1),i.removeAllRanges(),i.addRange(o)}function Ne(){return globalThis.navigator?.platform??""}function Q(e={}){let t=e.window??globalThis,n={...z,...e.config},i=e.isVisible??_e,o=e.platform??T(Ne()),a=g(o),r=e.bindings??{get:()=>a},s=e.onRound??(()=>{}),c=X({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function u(){let l=t.document.activeElement;l===null||l===t.document.body||l===t.document.documentElement||typeof l.blur=="function"&&l.blur()}function p(){u();let l=V(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:i});return c.render(l),l}return{apply(){let l=q(),d=[],y=!1,C=()=>{y||(y=!0,s("begin"))},b=()=>{y&&(y=!1,s("end"))},k=pe=>{let m=pe,S=r.get(),me=h(m,S.click)&&!j(S.click)||h(m,S.focus)&&!j(S.focus);if(l.mode==="idle"&&me&&Z(t.document.activeElement))return;let A=l.pending,fe={key:m.key,metaKey:m.metaKey,ctrlKey:m.ctrlKey,altKey:m.altKey,shiftKey:m.shiftKey,isComposing:m.isComposing},ge=l.mode!=="idle",v=U(l,fe,d.map(E=>E.label),S);if((ge||v.type!=="ignore")&&(m.preventDefault(),m.stopPropagation()),v.type==="ignore"){l.pending!==A&&c.render(d,l.pending);return}if(v.type==="activate-click"||v.type==="activate-focus"){C(),d=p();return}if(v.type==="exit"){d=[],c.destroy(),b();return}if(l.pending!==A&&c.render(d,l.pending),l.pending!=="")return;let ye=A+v.key,f=d.find(E=>E.label===ye);d=[],c.destroy(),b();let he=l.mode;if(l.mode="idle",f===void 0)return;let be=f.rect.x+f.rect.w/2,xe=f.rect.y+f.rect.h/2;if(O(f.element)==="focus")Me(f.element,t.document);else if(he==="click")He(f.element,be,xe);else{let E=f.element;typeof E.focus=="function"&&E.focus()}},R=()=>{t.document.visibilityState==="hidden"&&(d=[],c.destroy(),l.mode="idle",l.pending="",b())},N=()=>b();return t.addEventListener("keydown",k,{capture:!0}),t.document.addEventListener("visibilitychange",R),t.addEventListener("pagehide",N),()=>{t.removeEventListener("keydown",k,{capture:!0}),t.document.removeEventListener("visibilitychange",R),t.removeEventListener("pagehide",N),c.destroy(),d=[],b()}}}}var Fe="/api/dsh-jump/ime";function ee(e,t=globalThis.fetch.bind(globalThis)){t(Fe,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({op:e}),keepalive:!0}).catch(()=>{})}var Ge={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9009\u4E2D\u540E\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},Ye={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"The selected target only receives focus.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function _(e){return e.toLowerCase().startsWith("en")?Ye:Ge}var ze=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function te(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(ze.has(e.key)||e.isComposing)return{status:"pending"};let i=B({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),o=Y(i,t);return o!==null?{status:"rejected",issue:o}:{status:"accepted",binding:i}}function We(e,t){return[t==="click"?e.focus:e.click]}function ne(e){let{store:t,platform:n}=e,i=new Set,o={bindings:t.get(),recording:null,issue:null},a=r=>{if(!(r.bindings===o.bindings&&r.recording===o.recording&&r.issue===o.issue)){o=r;for(let s of i)s(o)}};return t.subscribe(r=>{a({...o,bindings:r,issue:null})}),{getState:()=>o,begin(r){a({...o,recording:r,issue:null})},press(r){let s=o.recording;if(s===null)return"idle";let c=te(r,We(o.bindings,s),n);return c.status==="pending"?"pending":c.status==="cancel"?(a({...o,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(a({...o,issue:c.issue}),"rejected"):(t.set({...o.bindings,[s]:c.binding}),a({...o,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),a({bindings:t.get(),recording:null,issue:null})},resetAction(r){let s=g(n),c=r==="click"?"focus":"click",u={...o.bindings,[r]:s[r]};w(u[r],u[c])&&(u[c]=s[c]),t.set(u),a({bindings:t.get(),recording:null,issue:null})},subscribe(r){return i.add(r),()=>{i.delete(r)}}}}function ie(e,t,n){let i=e.useRef(n);i.current=n,e.useEffect(()=>{if(t===null)return;let o=r=>{r.preventDefault(),r.stopPropagation(),i.current(r)},a=globalThis.document;return a.addEventListener("keydown",o,{capture:!0}),()=>{a.removeEventListener("keydown",o,{capture:!0})}},[t])}var Ve=`
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
`,oe="dsh-jump/page.css";function se(e){let t=`style[data-plugin-css=${JSON.stringify(oe)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=oe,n.textContent=Ve,e.head.append(n),()=>n.remove()}function re(e){let{React:t,action:n,controller:i,platform:o,copy:a,title:r,description:s,name:c}=e,u=t.useSyncExternalStore(y=>i.subscribe(()=>y()),()=>i.getState()),p=u.recording===n,l=P(u.bindings[n],o),d=P(g(o)[n],o);return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},r),t.createElement("p",{"data-dsh-jump-description":""},p?a.recordingHint:s)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":p?"":void 0,"aria-label":c,"aria-keyshortcuts":l,onClick:()=>{i.begin(n)}},p?a.recording:l),t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:l===d,onClick:()=>{i.resetAction(n)}},a.reset)))}function ae(e){let{React:t,controller:n,platform:i,copy:o}=e,a=t.useSyncExternalStore(r=>n.subscribe(()=>r()),()=>n.getState());return ie(t,a.recording,r=>{n.press({key:r.key,metaKey:r.metaKey,ctrlKey:r.ctrlKey,altKey:r.altKey,shiftKey:r.shiftKey,isComposing:r.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},o.title),t.createElement("p",{"data-dsh-jump-lede":""},o.description)),re({React:t,action:"click",controller:n,platform:i,copy:o,title:o.clickTitle,description:o.clickDescription,name:o.clickName}),re({React:t,action:"focus",controller:n,platform:i,copy:o,title:o.focusTitle,description:o.focusDescription,name:o.focusName}),a.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},o.issues[a.issue]),t.createElement("p",{"data-dsh-jump-note":""},o.bareNote))}var H="dsh-jump:bindings:v1";function qe(e,t){return w(e.click,t.click)&&w(e.focus,t.focus)}function Ue(){try{return globalThis.localStorage??null}catch{return null}}function ce(e){let t=g(e.platform),n=e.storage===void 0?Ue():e.storage,i=new Set,o=()=>{if(n===null)return t;try{let s=n.getItem(H);return s===null?t:L(JSON.parse(s),e.platform)}catch{return t}},a=o(),r=s=>{if(!qe(a,s)){a=s;for(let c of i)c(a)}};return{get:()=>a,set(s){if(r(L(s,e.platform)),n!==null)try{n.setItem(H,JSON.stringify(a))}catch{}},reset(){if(r(t),n!==null)try{n.removeItem(H)}catch{}},reload(){r(o())},subscribe(s){return i.add(s),()=>{i.delete(s)}}}}var le="settings.section",Xe="jump",$e=25;function ue(e){let{ctx:t,platform:n,React:i,config:o}=e,a=e.store??ce({platform:n}),r=e.imeFetch,s=Q({config:o,bindings:a,platform:n,window:e.window,onRound:u=>ee(u,r)}),c=[s.apply()];return i!==null&&c.push(t.inject(["slots"],u=>{let p=u.get("slots");if(p===void 0)return;let l=u.get("locale"),d=ne({store:a,platform:n}),y=()=>_(l?.getSnapshot().active??"zh").navLabel,C=()=>ae({React:i,controller:d,platform:n,copy:_(l?.getSnapshot().active??"zh")}),b=p.inject(le,()=>p.register({name:le,id:Xe,order:$e,label:y},C)),k=e.document??globalThis.document,R=k===void 0?void 0:se(k);return()=>{b(),R?.()}})),{store:a,app:s,dispose(){for(;c.length>0;)c.pop()?.()}}}var M=null;function Ze(){return T(globalThis.navigator?.platform??"")}function Qe(){if(M===null)return null;let e=M("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var de={name:"dsh-jump",inject:[],apply(e,t){let n=ue({ctx:e,platform:Ze(),React:Qe(),config:t});return()=>n.dispose()}};function et(e){M=e}var tt=de;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
