window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var j=Object.defineProperty;var ve=Object.getOwnPropertyDescriptor;var Ee=Object.getOwnPropertyNames;var ke=Object.prototype.hasOwnProperty;var we=(e,t)=>{for(var n in t)j(e,n,{get:t[n],enumerable:!0})},Se=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of Ee(t))!ke.call(e,i)&&i!==n&&j(e,i,{get:()=>t[i],enumerable:!(r=ve(t,i))||r.enumerable});return e};var Te=e=>Se(j({},"__esModule",{value:!0}),e);var pt={};we(pt,{boot:()=>ut,clientPlugin:()=>xe,default:()=>dt});module.exports=Te(pt);var F=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function B(e){return e.meta||e.alt||e.ctrl||e.shift}function Je(e){return e.length>1&&!F.includes(e)}var Be={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},Ae={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},Ce={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},Ie={" ":"Space"};function A(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function v(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t},reference:null}}function G(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function J(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function S(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!G(e))return t;let r=e.key;return typeof r!="string"||r.length===0?t:{key:r.length===1?r.toLowerCase():r,meta:J(e,"meta"),alt:J(e,"alt"),ctrl:J(e,"ctrl"),shift:J(e,"shift")}}function L(e,t="macos"){let n=v(t),r=G(e)?e:{};return{click:S(r.click,n.click,t),focus:S(r.focus,n.focus,t),reference:je(r.reference,t)}}function je(e,t){if(e==null)return null;let r=S(e,{key:"",meta:!1,alt:!1,ctrl:!1,shift:!1},t);return r.key===""?null:r}function E(e,t){return e===null||t===null?e===t:e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function U(e,t){return F.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!Je(e.key)?"no-modifier":t.some(r=>E(r,e))?"duplicate":null}function x(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function Le(e,t){let r=(t==="macos"?Ce:Ie)[e];return r!==void 0?r:e.length===1?e.toUpperCase():e}function D(e,t){let r=["ctrl","alt","shift","meta"].filter(s=>e[s]).map(s=>t==="macos"?Be[s]:Ae[s]);return r.push(Le(e.key,t)),t==="macos"?r.join(""):r.join("+")}var k=["a","s","d","f","g","h","j","k","l"],De=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],K=["textbox","searchbox"],Ke=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...De.map(e=>`[role=${e}]`),...K.map(e=>`[role=${e}]`)].join(", "),$={candidateSelector:Ke};function*Pe(e=1){if(e<=1){yield*k;return}let t=[...k];for(let n=1;n<e;n+=1){let r=[];for(let i of t){let s=i[i.length-1];if(s===void 0)break;for(let o of k)o!==s&&r.push(i+o);r.push(i+s)}t=r}yield*t}var z=k.length;function _e(e){let t=1,n=z;for(;e>n;)t+=1,n*=z;return t}function Y(e,t,n){let r=[];for(let o of e()){let a=o.getBoundingClientRect();a.width>0&&a.height>0&&a.x<t.width&&a.x+a.width>0&&a.y<t.height&&a.y+a.height>0&&n.isVisible(o)&&r.push({element:o,rect:{x:a.x,y:a.y,w:a.width,h:a.height}})}let i=r.filter(({element:o})=>!r.some(a=>a.element!==o&&o.contains(a.element))),s=Pe(_e(i.length));return i.map(o=>{let a=s.next();if(a.done)throw new Error("dsh-jump: label space exhausted");return{element:o.element,label:a.value,rect:o.rect}})}function W(){return{mode:"idle",pending:""}}function P(e){e.mode="idle",e.pending=""}function V(e,t,n,r){if(e.mode==="idle")return x(t,r.click)?(e.mode="click",e.pending="",{type:"activate-click"}):x(t,r.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):r.reference!==null&&x(t,r.reference)?(e.mode="reference",e.pending="",{type:"activate-reference"}):{type:"ignore"};if(t.key==="Escape")return P(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return P(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(x(t,r.click)||x(t,r.focus)||r.reference!==null&&x(t,r.reference))return P(e),{type:"exit"};if(!k.includes(t.key))return e.pending="",{type:"ignore"};let i=e.pending+t.key;return n.includes(i)?(e.pending="",{type:"label",key:t.key}):n.some(s=>s.length>i.length&&s.startsWith(i))?(e.pending=i,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function q(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),r;function i(){if(r!==void 0)return r;let o=t.createElement("div");return o.dataset.dshJumpOverlay="",o.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(o),r=o,o}function s(o,a){let c=t.createElement("div");c.dataset.jumpLabel=o.label,c.textContent=o.label;let{width:l,height:p}=n(),f=Math.min(Math.max(o.rect.x,0),Math.max(l-24,0)),u=Math.min(Math.max(o.rect.y,0),Math.max(p-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(f))+"px;top:"+String(Math.round(u))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(a?"1":"0.3"),c}return{render(o,a=""){i().replaceChildren(...o.map(l=>s(l,l.label.startsWith(a))))},destroy(){r?.remove(),r=void 0}}}var Oe=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Ne=new Set(["TEXTAREA"]);function X(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function _(e){if(X(e))return"focus";let t=e.tagName;if(t==="INPUT"){let r=(e.getAttribute("type")??"text").trim().toLowerCase();return Oe.has(r)?"focus":"click"}if(Ne.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&K.includes(n.trim().toLowerCase())?"focus":"click"}function Z(e){if(e===null)return!1;if(_(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if(X(t))return!0;return!1}function Me(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function He(e,t,n){let r=e.ownerDocument?.defaultView;if(r==null)return;let i=(a,c)=>new r.MouseEvent(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),s=r.PointerEvent,o=(a,c)=>s===void 0?i(a,c):new s(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(o("pointerdown",1)),e.dispatchEvent(i("mousedown",1)),e.dispatchEvent(o("pointerup",0)),e.dispatchEvent(i("mouseup",0)),e.dispatchEvent(i("click",0))}function Fe(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let r=t.getSelection?.()??null;if(r===null)return;let i=t.createRange();i.selectNodeContents(e),i.collapse(!1),r.removeAllRanges(),r.addRange(i)}function Ge(){return globalThis.navigator?.platform??""}function Q(e={}){let t=e.window??globalThis,n={...$,...e.config},r=e.isVisible??Me,i=e.platform??A(Ge()),s=v(i),o=e.bindings??{get:()=>s},a=q({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function c(){let l=Y(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:r});return a.render(l),l}return{apply(){let l=W(),p=[],f=u=>{let d=o.get(),y=x(u,d.click)&&!B(d.click)||x(u,d.focus)&&!B(d.focus)||d.reference!==null&&x(u,d.reference)&&!B(d.reference);if(l.mode==="idle"&&y&&Z(t.document.activeElement))return;let b=l.pending,h={key:u.key,metaKey:u.metaKey,ctrlKey:u.ctrlKey,altKey:u.altKey,shiftKey:u.shiftKey,isComposing:u.isComposing},R=l.mode!=="idle",g=V(l,h,p.map(w=>w.label),d);if((R||g.type!=="ignore")&&(u.preventDefault(),u.stopPropagation()),g.type==="ignore"){l.pending!==b&&a.render(p,l.pending);return}if(g.type==="activate-click"||g.type==="activate-focus"||g.type==="activate-reference"){p=c();return}if(g.type==="exit"){p=[],a.destroy();return}if(l.pending!==b&&a.render(p,l.pending),l.pending!=="")return;let C=b+g.key,m=p.find(w=>w.label===C);p=[],a.destroy();let T=l.mode;if(l.mode="idle",m===void 0)return;let I=m.rect.x+m.rect.w/2,Re=m.rect.y+m.rect.h/2;if(T==="reference"){e.onReference?.(m.element);return}if(_(m.element)==="focus")Fe(m.element,t.document);else if(T==="click")He(m.element,I,Re);else{let w=m.element;typeof w.focus=="function"&&w.focus()}};return t.addEventListener("keydown",f,{capture:!0}),()=>{t.removeEventListener("keydown",f,{capture:!0}),a.destroy(),p=[]}}}}var Ue={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9009\u4E2D\u540E\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",referenceTitle:"\u5F15\u7528\u6A21\u5F0F",referenceDescription:"\u9009\u4E2D\u540E\u628A\u8BE5\u5143\u7D20\u4F5C\u4E3A\u5F15\u7528\u63D2\u5165\u8F93\u5165\u6846\uFF0C\u4E0D\u70B9\u51FB\u4E5F\u4E0D\u79FB\u52A8\u7126\u70B9\u3002",referenceDisabled:"\u672A\u542F\u7528",referenceDisable:"\u5173\u95ED\u5F15\u7528\u6A21\u5F0F",referenceNeedsSession:"\u9700\u8981\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u5F15\u7528\u8981\u63D2\u8FDB\u5B83\u7684\u8F93\u5165\u6846\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",referenceName:"\u5F15\u7528\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},$e={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"The selected target only receives focus.",referenceTitle:"Reference mode",referenceDescription:"The selected element is inserted into the composer as a reference; nothing is clicked and focus does not move.",referenceDisabled:"Off",referenceDisable:"Turn off reference mode",referenceNeedsSession:"Open a session first: the reference is inserted into its composer.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",referenceName:"Reference-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function O(e){return e.toLowerCase().startsWith("en")?$e:Ue}var ze=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function ee(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(ze.has(e.key)||e.isComposing)return{status:"pending"};let r=S({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),i=U(r,t);return i!==null?{status:"rejected",issue:i}:{status:"accepted",binding:r}}function Ye(e,t){let n=["click","focus","reference"].filter(i=>i!==t),r=[];for(let i of n){let s=e[i];s!==null&&r.push(s)}return r}function te(e){let{store:t,platform:n}=e,r=new Set,i={bindings:t.get(),recording:null,issue:null},s=o=>{if(!(o.bindings===i.bindings&&o.recording===i.recording&&o.issue===i.issue)){i=o;for(let a of r)a(i)}};return t.subscribe(o=>{s({...i,bindings:o,issue:null})}),{getState:()=>i,begin(o){s({...i,recording:o,issue:null})},press(o){let a=i.recording;if(a===null)return"idle";let c=ee(o,Ye(i.bindings,a),n);return c.status==="pending"?"pending":c.status==="cancel"?(s({...i,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(s({...i,issue:c.issue}),"rejected"):(t.set({...i.bindings,[a]:c.binding}),s({...i,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),s({bindings:t.get(),recording:null,issue:null})},resetAction(o){if(o==="reference"){t.set({...i.bindings,reference:null}),s({bindings:t.get(),recording:null,issue:null});return}let a=v(n),c={...i.bindings,[o]:a[o]};for(let l of["click","focus"])l!==o&&E(c[o],c[l])&&(c[l]=a[l]);t.set(c),s({bindings:t.get(),recording:null,issue:null})},disableAction(o){o==="reference"&&(t.set({...i.bindings,reference:null}),s({bindings:t.get(),recording:null,issue:null}))},subscribe(o){return r.add(o),()=>{r.delete(o)}}}}function ne(e,t,n){let r=e.useRef(n);r.current=n,e.useEffect(()=>{if(t===null)return;let i=o=>{o.preventDefault(),o.stopPropagation(),r.current(o)},s=globalThis.document;return s.addEventListener("keydown",i,{capture:!0}),()=>{s.removeEventListener("keydown",i,{capture:!0})}},[t])}var We=`
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
`,re="dsh-jump/page.css";function ie(e){let t=`style[data-plugin-css=${JSON.stringify(re)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=re,n.textContent=We,e.head.append(n),()=>n.remove()}function N(e){let{React:t,action:n,controller:r,platform:i,copy:s,title:o,description:a,name:c}=e,l=t.useSyncExternalStore(h=>r.subscribe(()=>h()),()=>r.getState()),p=l.recording===n,f=l.bindings[n],u=f===null?null:D(f,i),d=v(i)[n],y=d===null?null:D(d,i),b=n==="reference";return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},o),t.createElement("p",{"data-dsh-jump-description":""},p?s.recordingHint:a)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":p?"":void 0,"aria-label":c,...u===null?{}:{"aria-keyshortcuts":u},onClick:()=>{r.begin(n)}},p?s.recording:u??s.referenceDisabled),b?t.createElement("button",{type:"button","data-dsh-jump-disable":n,disabled:f===null,onClick:()=>{r.disableAction(n)}},s.referenceDisable):null,t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:u===y,onClick:()=>{r.resetAction(n)}},s.reset)))}function oe(e){let{React:t,controller:n,platform:r,copy:i}=e,s=t.useSyncExternalStore(o=>n.subscribe(()=>o()),()=>n.getState());return ne(t,s.recording,o=>{n.press({key:o.key,metaKey:o.metaKey,ctrlKey:o.ctrlKey,altKey:o.altKey,shiftKey:o.shiftKey,isComposing:o.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},i.title),t.createElement("p",{"data-dsh-jump-lede":""},i.description)),N({React:t,action:"click",controller:n,platform:r,copy:i,title:i.clickTitle,description:i.clickDescription,name:i.clickName}),N({React:t,action:"focus",controller:n,platform:r,copy:i,title:i.focusTitle,description:i.focusDescription,name:i.focusName}),N({React:t,action:"reference",controller:n,platform:r,copy:i,title:i.referenceTitle,description:i.referenceDescription,name:i.referenceName}),s.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},i.issues[s.issue]),t.createElement("p",{"data-dsh-jump-note":""},i.bareNote))}var M="dsh-jump:bindings:v1";function Ve(e,t){return E(e.click,t.click)&&E(e.focus,t.focus)&&E(e.reference,t.reference)}function qe(){try{return globalThis.localStorage??null}catch{return null}}function se(e){let t=v(e.platform),n=e.storage===void 0?qe():e.storage,r=new Set,i=()=>{if(n===null)return t;try{let a=n.getItem(M);return a===null?t:L(JSON.parse(a),e.platform)}catch{return t}},s=i(),o=a=>{if(!Ve(s,a)){s=a;for(let c of r)c(s)}};return{get:()=>s,set(a){if(o(L(a,e.platform)),n!==null)try{n.setItem(M,JSON.stringify(s))}catch{}},reset(){if(o(t),n!==null)try{n.removeItem(M)}catch{}},reload(){o(i())},subscribe(a){return r.add(a),()=>{r.delete(a)}}}}var ae="lionad.jump";var Xe=/^(?:css-|sc-|jsx-|_|svelte-|emotion-)/u,Ze=new Set(["flex","grid","block","inline","hidden","relative","absolute","static","sticky","fixed","container","row","col","wrap","grow","shrink","truncate","sr-only","active","disabled","selected","focused","open","closed"]);function Qe(e){return e===""||Ze.has(e)||Xe.test(e)?!1:e.includes("-")||e.includes("_")}function et(e){let t=e.replace(/\s+/gu," ").trim();return t.length<=80?t:`${t.slice(0,79).trimEnd()}\u2026`}function ce(e){let t=e.tagName.toLowerCase(),n=e.getAttribute("id")?.trim()??"",r=e.getAttribute("data-testid")?.trim()??"",i=e.getAttribute("role")?.trim()??"",s=e.getAttribute("aria-label")?.trim()??"",o=Array.from(e.classList).filter(Qe).slice(0,3),a=et(e.textContent??"");return{kind:"ui.element",tag:t,...n===""?{}:{id:n},...r===""?{}:{testId:r},...o.length===0?{}:{classes:o},...i===""?{}:{role:i},...s===""?{}:{ariaLabel:s},...a===""?{}:{text:a}}}function le(e){return e.testId!==void 0?`${e.tag}[data-testid=${e.testId}]`:e.id!==void 0?`${e.tag}#${e.id}`:e.tag}function tt(e){return e.ariaLabel!==void 0?e.ariaLabel:e.text!==void 0?e.text:e.classes?.[0]}function ue(e){let t=[`[ui element] <${e.tag}>`];return e.testId!==void 0&&t.push(`data-testid="${e.testId}"`),e.id!==void 0&&t.push(`id="${e.id}"`),e.role!==void 0&&t.push(`role=${e.role}`),e.ariaLabel!==void 0&&t.push(`aria-label="${e.ariaLabel}"`),e.classes!==void 0&&e.classes.length>0&&t.push(`class="${e.classes.join(" ")}"`),e.text!==void 0&&t.push(`text="${e.text}"`),t.join(" ")}function de(e){let t=le(e),n=tt(e);return{kind:"ui.element",id:t,label:n===void 0?e.tag:`${e.tag}\u300C${n}\u300D`,clipboardText:`[ui element ${t}]`,modelText:ue(e),ref:JSON.stringify(e)}}function pe(e){let t;try{t=JSON.parse(e)}catch{return}if(t===null||typeof t!="object")return;let n=t;if(!(typeof n.tag!="string"||n.tag===""))return{kind:"ui.element",tag:n.tag,...typeof n.id=="string"?{id:n.id}:{},...typeof n.testId=="string"?{testId:n.testId}:{},...Array.isArray(n.classes)?{classes:n.classes.filter(r=>typeof r=="string")}:{},...typeof n.role=="string"?{role:n.role}:{},...typeof n.ariaLabel=="string"?{ariaLabel:n.ariaLabel}:{},...typeof n.text=="string"?{text:n.text}:{}}}function nt(e){let t=pe(e);return t===void 0?`[ui element ${e}]`:`[ui element ${le(t)}]`}function rt(e){let t=pe(e);return t===void 0?`[ui element ${e}]`:ue(t)}function fe(e,t){let n={source:ae,ref:t.ref,label:t.label,clipboardText:t.clipboardText,appearance:"session"};if(e.canInsertReference){let i=e.captureSpan();if(i!==void 0){if(e.insertReference(n,i))return"reference";let s=e.captureSpan();if(s!==void 0&&e.insertReference(n,s))return"reference"}}let r=e.captureSpan();return r===void 0?"failed":e.insertText(t.clipboardText,r)?"text":"failed"}function me(e,t){return function(r){let i=r??{},s=i.sessionId??null,o=i.inputActions??null,a=e.useRef({sessionId:s,inputActions:o});a.current={sessionId:s,inputActions:o};let c=o!==null;return e.useEffect(()=>{t({sessionId:s,inputActions:a.current.inputActions})},[s,c]),null}}function ge(){return{trigger:"@",name:ae,showGroupTitle:!1,async candidates(){return[]},onPick(){},codec:{clipboardText:nt,async serialize(e){return rt(e)}}}}var ye="settings.section",it="jump",ot=25,be="conversation.input.overlay",st="jump.session-bridge",at=95;function he(e){let{ctx:t,platform:n,React:r,config:i}=e,s=e.store??se({platform:n}),o={state:{sessionId:null,inputActions:null}},a={registered:!1},c=f=>{let{sessionId:u,inputActions:d}=o.state;if(u===null||d===null)return"no-session";let y;try{let h=t.get("sessions"),R=t.get("conversation"),g=h?.scope?.(u);if(g===void 0||R?.input?.for===void 0)return"no-session";y=R.input.for(g)}catch{return"no-session"}if(y==null)return"no-session";let b=fe({captureSpan:()=>d.captureInsertion?.(),insertReference:(h,R)=>y?.insertReference?.(h,R)??!1,insertText:(h,R)=>d.insertText?.(h,R)??!1,canInsertReference:a.registered},de(ce(f)));return(b==="reference"||b==="text")&&y.focus?.(),b},l=Q({config:i,bindings:s,platform:n,window:e.window,onReference:f=>{c(f)}}),p=[l.apply()];return typeof t.inject=="function"&&p.push(t.inject(["inputTriggers"],f=>{let u=f.get("inputTriggers");if(u===void 0)return;let d=u.registerSource(ge());return a.registered=!0,()=>{d(),a.registered=!1}})),r!==null&&p.push(t.inject(["slots"],f=>{let u=f.get("slots");if(u===void 0)return;let d=f.get("locale"),y=te({store:s,platform:n}),b=()=>O(d?.getSnapshot().active??"zh").navLabel,h=()=>oe({React:r,controller:y,platform:n,copy:O(d?.getSnapshot().active??"zh")}),R=u.inject(ye,()=>u.register({name:ye,id:it,order:ot,label:b},h)),g=me(r,I=>{o.state=I}),C=u.inject(be,()=>u.register({name:be,id:st,order:at},g)),m=e.document??globalThis.document,T=m===void 0?void 0:ie(m);return()=>{R(),C(),T?.()}})),{store:s,app:l,dispose(){for(;p.length>0;)p.pop()?.()}}}var H=null;function ct(){return A(globalThis.navigator?.platform??"")}function lt(){if(H===null)return null;let e=H("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var xe={name:"dsh-jump",inject:[],apply(e,t){let n=he({ctx:e,platform:ct(),React:lt(),config:t});return()=>n.dispose()}};function ut(e){H=e}var dt=xe;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
