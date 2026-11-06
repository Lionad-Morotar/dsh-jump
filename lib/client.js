window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var I=Object.defineProperty;var ve=Object.getOwnPropertyDescriptor;var Ee=Object.getOwnPropertyNames;var ke=Object.prototype.hasOwnProperty;var we=(e,t)=>{for(var n in t)I(e,n,{get:t[n],enumerable:!0})},Se=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of Ee(t))!ke.call(e,i)&&i!==n&&I(e,i,{get:()=>t[i],enumerable:!(r=ve(t,i))||r.enumerable});return e};var Te=e=>Se(I({},"__esModule",{value:!0}),e);var pt={};we(pt,{boot:()=>ut,clientPlugin:()=>be,default:()=>dt});module.exports=Te(pt);var H=["Escape","Tab","Enter"," ","Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Dead","CapsLock","AltGraph","Unidentified","Meta","Control","Alt","Shift","OS",""];function A(e){return e.meta||e.alt||e.ctrl||e.shift}function Je(e){return e.length>1&&!H.includes(e)}var Be={ctrl:"\u2303",alt:"\u2325",shift:"\u21E7",meta:"\u2318"},Ae={ctrl:"Ctrl",alt:"Alt",shift:"Shift",meta:"Meta"},Ce={" ":"Space",Escape:"Esc",Enter:"\u21A9",Tab:"\u21E5",Backspace:"\u232B",Delete:"\u2326",ArrowUp:"\u2191",ArrowDown:"\u2193",ArrowLeft:"\u2190",ArrowRight:"\u2192"},Ie={" ":"Space"};function C(e){let t=e.trim().toLowerCase();return t===""||/mac|darwin|iphone|ipad/.test(t)?"macos":"other"}function R(e){let t=e==="macos"?{meta:!0,ctrl:!1}:{meta:!1,ctrl:!0};return{click:{key:"h",alt:!1,shift:!1,...t},focus:{key:"u",alt:!1,shift:!1,...t},reference:null}}function F(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function B(e,t){return e[t]===!0||t==="ctrl"&&e.control===!0}function S(e,t,n="macos"){if(typeof e=="string")return e.length!==1?t:{key:e.toLowerCase(),meta:n==="macos",alt:!1,ctrl:n!=="macos",shift:!1};if(!F(e))return t;let r=e.key;return typeof r!="string"||r.length===0?t:{key:r.length===1?r.toLowerCase():r,meta:B(e,"meta"),alt:B(e,"alt"),ctrl:B(e,"ctrl"),shift:B(e,"shift")}}function j(e,t="macos"){let n=R(t),r=F(e)?e:{};return{click:S(r.click,n.click,t),focus:S(r.focus,n.focus,t),reference:je(r.reference,t)}}function je(e,t){if(e==null)return null;let r=S(e,{key:"",meta:!1,alt:!1,ctrl:!1,shift:!1},t);return r.key===""?null:r}function v(e,t){return e===null||t===null?e===t:e.key.toLowerCase()===t.key.toLowerCase()&&e.meta===t.meta&&e.alt===t.alt&&e.ctrl===t.ctrl&&e.shift===t.shift}function G(e,t){return H.includes(e.key)?"reserved-key":!e.meta&&!e.alt&&!e.ctrl&&!Je(e.key)?"no-modifier":t.some(r=>v(r,e))?"duplicate":null}function h(e,t){return e.isComposing?!1:e.key.toLowerCase()===t.key.toLowerCase()&&e.metaKey===t.meta&&e.altKey===t.alt&&e.ctrlKey===t.ctrl&&e.shiftKey===t.shift}function Le(e,t){let r=(t==="macos"?Ce:Ie)[e];return r!==void 0?r:e.length===1?e.toUpperCase():e}function L(e,t){let r=["ctrl","alt","shift","meta"].filter(s=>e[s]).map(s=>t==="macos"?Be[s]:Ae[s]);return r.push(Le(e.key,t)),t==="macos"?r.join(""):r.join("+")}var E=["a","s","d","f","g","h","j","k","l"],De=["button","link","tab","treeitem","option","menuitem","menuitemcheckbox","menuitemradio","checkbox","radio","switch","slider","spinbutton"],D=["textbox","searchbox"],Ke=["a[href]","area[href]","button","input:not([type=hidden])","select","textarea","summary","[tabindex]","[contenteditable]:not([contenteditable=false])",...De.map(e=>`[role=${e}]`),...D.map(e=>`[role=${e}]`)].join(", "),U={candidateSelector:Ke};function*Pe(e=1){if(e<=1){yield*E;return}let t=[...E];for(let n=1;n<e;n+=1){let r=[];for(let i of t){let s=i[i.length-1];if(s===void 0)break;for(let o of E)o!==s&&r.push(i+o);r.push(i+s)}t=r}yield*t}var $=E.length;function _e(e){let t=1,n=$;for(;e>n;)t+=1,n*=$;return t}function z(e,t,n){let r=[];for(let o of e()){let a=o.getBoundingClientRect();a.width>0&&a.height>0&&a.x<t.width&&a.x+a.width>0&&a.y<t.height&&a.y+a.height>0&&n.isVisible(o)&&r.push({element:o,rect:{x:a.x,y:a.y,w:a.width,h:a.height}})}let i=r.filter(({element:o})=>!r.some(a=>a.element!==o&&o.contains(a.element))),s=Pe(_e(i.length));return i.map(o=>{let a=s.next();if(a.done)throw new Error("dsh-jump: label space exhausted");return{element:o.element,label:a.value,rect:o.rect}})}function Y(){return{mode:"idle",pending:""}}function K(e){e.mode="idle",e.pending=""}function W(e,t,n,r){if(e.mode==="idle")return h(t,r.click)?(e.mode="click",e.pending="",{type:"activate-click"}):h(t,r.focus)?(e.mode="focus",e.pending="",{type:"activate-focus"}):r.reference!==null&&h(t,r.reference)?(e.mode="reference",e.pending="",{type:"activate-reference"}):{type:"ignore"};if(t.key==="Escape")return K(e),{type:"exit"};if(t.metaKey||t.ctrlKey||t.altKey)return K(e),{type:"exit"};if(t.shiftKey||t.isComposing)return{type:"ignore"};if(h(t,r.click)||h(t,r.focus)||r.reference!==null&&h(t,r.reference))return K(e),{type:"exit"};if(!E.includes(t.key))return e.pending="",{type:"ignore"};let i=e.pending+t.key;return n.includes(i)?(e.pending="",{type:"label",key:t.key}):n.some(s=>s.length>i.length&&s.startsWith(i))?(e.pending=i,{type:"label",key:t.key}):(e.pending="",{type:"ignore"})}function V(e={}){let t=e.doc??globalThis.document,n=e.viewport??(()=>({width:globalThis.innerWidth,height:globalThis.innerHeight})),r;function i(){if(r!==void 0)return r;let o=t.createElement("div");return o.dataset.dshJumpOverlay="",o.style.cssText="position:fixed;inset:0;z-index:2147483647;pointer-events:none",t.documentElement.append(o),r=o,o}function s(o,a){let c=t.createElement("div");c.dataset.jumpLabel=o.label,c.textContent=o.label;let{width:l,height:d}=n(),p=Math.min(Math.max(o.rect.x,0),Math.max(l-24,0)),u=Math.min(Math.max(o.rect.y,0),Math.max(d-16,0));return c.style.cssText="position:fixed;left:"+String(Math.round(p))+"px;top:"+String(Math.round(u))+"px;padding:1px 3px;background:#ffd60a;color:#000;border-radius:3px;font:11px/1.3 ui-monospace,Menlo,monospace;pointer-events:none;opacity:"+(a?"1":"0.3"),c}return{render(o,a=""){i().replaceChildren(...o.map(l=>s(l,l.label.startsWith(a))))},destroy(){r?.remove(),r=void 0}}}var Oe=new Set(["text","search","url","tel","email","password","number","date","month","week","time","datetime-local"]),Ne=new Set(["TEXTAREA"]);function q(e){let t=e.getAttribute("contenteditable");return t===null?!1:t.trim().toLowerCase()!=="false"}function P(e){if(q(e))return"focus";let t=e.tagName;if(t==="INPUT"){let r=(e.getAttribute("type")??"text").trim().toLowerCase();return Oe.has(r)?"focus":"click"}if(Ne.has(t))return"focus";let n=e.getAttribute("role");return n!==null&&D.includes(n.trim().toLowerCase())?"focus":"click"}function X(e){if(e===null)return!1;if(P(e)==="focus")return!0;for(let t=e;t!==null;t=t.parentElement)if(q(t))return!0;return!1}function Me(e){let t=e;if(typeof t.checkVisibility=="function")return t.checkVisibility();let n=t.ownerDocument?.defaultView;return t.offsetParent!==null||n?.getComputedStyle(t).position==="fixed"}function He(e,t,n){let r=e.ownerDocument?.defaultView;if(r==null)return;let i=(a,c)=>new r.MouseEvent(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c}),s=r.PointerEvent,o=(a,c)=>s===void 0?i(a,c):new s(a,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,button:0,buttons:c,pointerId:1,pointerType:"mouse",isPrimary:!0});e.dispatchEvent(o("pointerdown",1)),e.dispatchEvent(i("mousedown",1)),e.dispatchEvent(o("pointerup",0)),e.dispatchEvent(i("mouseup",0)),e.dispatchEvent(i("click",0))}function Fe(e,t){let n=e;if(typeof n.focus!="function"||t.activeElement===e||(n.focus(),t.activeElement!==e))return;let r=t.getSelection?.()??null;if(r===null)return;let i=t.createRange();i.selectNodeContents(e),i.collapse(!1),r.removeAllRanges(),r.addRange(i)}function Ge(){return globalThis.navigator?.platform??""}function Z(e={}){let t=e.window??globalThis,n={...U,...e.config},r=e.isVisible??Me,i=e.platform??C(Ge()),s=R(i),o=e.bindings??{get:()=>s},a=V({doc:t.document,viewport:()=>({width:t.innerWidth,height:t.innerHeight})});function c(){let l=z(()=>Array.from(t.document.querySelectorAll(n.candidateSelector)),{width:t.innerWidth,height:t.innerHeight},{isVisible:r});return a.render(l),l}return{apply(){let l=Y(),d=[],p=u=>{let f=o.get(),b=h(u,f.click)&&!A(f.click)||h(u,f.focus)&&!A(f.focus)||f.reference!==null&&h(u,f.reference)&&!A(f.reference);if(l.mode==="idle"&&b&&X(t.document.activeElement))return;let m=l.pending,g={key:u.key,metaKey:u.metaKey,ctrlKey:u.ctrlKey,altKey:u.altKey,shiftKey:u.shiftKey,isComposing:u.isComposing},k=l.mode!=="idle",x=W(l,g,d.map(w=>w.label),f);if((k||x.type!=="ignore")&&(u.preventDefault(),u.stopPropagation()),x.type==="ignore"){l.pending!==m&&a.render(d,l.pending);return}if(x.type==="activate-click"||x.type==="activate-focus"||x.type==="activate-reference"){d=c();return}if(x.type==="exit"){d=[],a.destroy();return}if(l.pending!==m&&a.render(d,l.pending),l.pending!=="")return;let T=m+x.key,y=d.find(w=>w.label===T);d=[],a.destroy();let J=l.mode;if(l.mode="idle",y===void 0)return;let xe=y.rect.x+y.rect.w/2,Re=y.rect.y+y.rect.h/2;if(J==="reference"){e.onReference?.(y.element);return}if(P(y.element)==="focus")Fe(y.element,t.document);else if(J==="click")He(y.element,xe,Re);else{let w=y.element;typeof w.focus=="function"&&w.focus()}};return t.addEventListener("keydown",p,{capture:!0}),()=>{t.removeEventListener("keydown",p,{capture:!0}),a.destroy(),d=[]}}}}var Ue={navLabel:"\u8DF3\u8DC3\u5BFC\u822A",title:"\u8DF3\u8DC3\u5BFC\u822A",description:"\u6309\u4E0B\u7EC4\u5408\u952E\u540E\uFF0C\u7528\u5B57\u6BCD\u6807\u7B7E\u9009\u4E2D\u8981\u70B9\u51FB\u6216\u805A\u7126\u7684\u76EE\u6807\u3002",clickTitle:"\u70B9\u51FB\u6A21\u5F0F",clickDescription:"\u9009\u4E2D\u540E\u89E6\u53D1\u4E00\u6B21\u5B8C\u6574\u7684\u70B9\u51FB\u3002",focusTitle:"\u805A\u7126\u6A21\u5F0F",focusDescription:"\u9009\u4E2D\u540E\u53EA\u628A\u7126\u70B9\u79FB\u8FC7\u53BB\u3002",referenceTitle:"\u5F15\u7528\u6A21\u5F0F",referenceDescription:"\u9009\u4E2D\u540E\u628A\u8BE5\u5143\u7D20\u4F5C\u4E3A\u5F15\u7528\u63D2\u5165\u8F93\u5165\u6846\uFF0C\u4E0D\u70B9\u51FB\u4E5F\u4E0D\u79FB\u52A8\u7126\u70B9\u3002",referenceDisabled:"\u672A\u542F\u7528",referenceDisable:"\u5173\u95ED\u5F15\u7528\u6A21\u5F0F",referenceNeedsSession:"\u9700\u8981\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u5F15\u7528\u8981\u63D2\u8FDB\u5B83\u7684\u8F93\u5165\u6846\u3002",recording:"\u6309\u4E0B\u5FEB\u6377\u952E",recordingHint:"Esc \u53D6\u6D88",reset:"\u6062\u590D\u9ED8\u8BA4",clickName:"\u70B9\u51FB\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",focusName:"\u805A\u7126\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",referenceName:"\u5F15\u7528\u6A21\u5F0F\u7684\u5FEB\u6377\u952E",bareNote:"Insert\u3001F1 \u8FD9\u7C7B\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\u53EF\u4EE5\u4E0D\u914D\u4FEE\u9970\u952E\uFF1B\u5728\u8F93\u5165\u6846\u91CC\u5B83\u4EEC\u4ECD\u5F52\u8F93\u5165\u6846\u3002",issues:{"no-modifier":"\u5355\u4E2A\u5B57\u7B26\u7684\u952E\u9700\u8981\u2318\u6216\u2303\u6216\u2325\uFF0C\u4E0D\u4EA7\u751F\u5B57\u7B26\u7684\u952E\uFF08Insert\u3001F1 \u7B49\uFF09\u53EF\u4EE5\u76F4\u63A5\u7528","reserved-key":"\u8FD9\u4E2A\u952E\u88AB\u754C\u9762\u5360\u7528\u4E86",duplicate:"\u5DF2\u7ECF\u5206\u914D\u7ED9\u53E6\u4E00\u4E2A\u6A21\u5F0F"}},$e={navLabel:"Jump navigation",title:"Jump navigation",description:"Press a shortcut, then type a label to click or focus a target.",clickTitle:"Click mode",clickDescription:"The selected target receives a full click.",focusTitle:"Focus mode",focusDescription:"The selected target only receives focus.",referenceTitle:"Reference mode",referenceDescription:"The selected element is inserted into the composer as a reference; nothing is clicked and focus does not move.",referenceDisabled:"Off",referenceDisable:"Turn off reference mode",referenceNeedsSession:"Open a session first: the reference is inserted into its composer.",recording:"Press a shortcut",recordingHint:"Esc to cancel",reset:"Restore default",clickName:"Click-mode shortcut",focusName:"Focus-mode shortcut",referenceName:"Reference-mode shortcut",bareNote:"Keys that print nothing, such as Insert or F1, can be bound bare; while a text field has focus they still belong to it.",issues:{"no-modifier":"A single-character key needs \u2318, \u2303 or \u2325; a key that prints nothing (Insert, F1) can be used bare","reserved-key":"That key belongs to the interface",duplicate:"Already bound to the other mode"}};function _(e){return e.toLowerCase().startsWith("en")?$e:Ue}var ze=new Set(["Meta","Control","Alt","Shift","AltGraph","CapsLock","OS"]);function Q(e,t,n){if(e.key==="Escape")return{status:"cancel"};if(ze.has(e.key)||e.isComposing)return{status:"pending"};let r=S({key:e.key,meta:e.metaKey,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey},{key:e.key,meta:!1,alt:!1,ctrl:!1,shift:!1},n),i=G(r,t);return i!==null?{status:"rejected",issue:i}:{status:"accepted",binding:r}}function Ye(e,t){let n=["click","focus","reference"].filter(i=>i!==t),r=[];for(let i of n){let s=e[i];s!==null&&r.push(s)}return r}function ee(e){let{store:t,platform:n}=e,r=new Set,i={bindings:t.get(),recording:null,issue:null},s=o=>{if(!(o.bindings===i.bindings&&o.recording===i.recording&&o.issue===i.issue)){i=o;for(let a of r)a(i)}};return t.subscribe(o=>{s({...i,bindings:o,issue:null})}),{getState:()=>i,begin(o){s({...i,recording:o,issue:null})},press(o){let a=i.recording;if(a===null)return"idle";let c=Q(o,Ye(i.bindings,a),n);return c.status==="pending"?"pending":c.status==="cancel"?(s({...i,recording:null,issue:null}),"cancelled"):c.status==="rejected"?(s({...i,issue:c.issue}),"rejected"):(t.set({...i.bindings,[a]:c.binding}),s({...i,bindings:t.get(),recording:null,issue:null}),"saved")},reset(){t.reset(),s({bindings:t.get(),recording:null,issue:null})},resetAction(o){if(o==="reference"){t.set({...i.bindings,reference:null}),s({bindings:t.get(),recording:null,issue:null});return}let a=R(n),c={...i.bindings,[o]:a[o]};for(let l of["click","focus"])l!==o&&v(c[o],c[l])&&(c[l]=a[l]);t.set(c),s({bindings:t.get(),recording:null,issue:null})},disableAction(o){o==="reference"&&(t.set({...i.bindings,reference:null}),s({bindings:t.get(),recording:null,issue:null}))},subscribe(o){return r.add(o),()=>{r.delete(o)}}}}function te(e,t,n){let r=e.useRef(n);r.current=n,e.useEffect(()=>{if(t===null)return;let i=o=>{o.preventDefault(),o.stopPropagation(),r.current(o)},s=globalThis.document;return s.addEventListener("keydown",i,{capture:!0}),()=>{s.removeEventListener("keydown",i,{capture:!0})}},[t])}var We=`
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
`,ne="dsh-jump/page.css";function re(e){let t=`style[data-plugin-css=${JSON.stringify(ne)}]`;if(e.querySelector(t)!==null)return()=>{};let n=e.createElement("style");return n.dataset.plugin="dsh-jump",n.dataset.pluginCss=ne,n.textContent=We,e.head.append(n),()=>n.remove()}function O(e){let{React:t,action:n,controller:r,platform:i,copy:s,title:o,description:a,name:c}=e,l=t.useSyncExternalStore(g=>r.subscribe(()=>g()),()=>r.getState()),d=l.recording===n,p=l.bindings[n],u=p===null?null:L(p,i),f=R(i)[n],b=f===null?null:L(f,i),m=n==="reference";return t.createElement("div",{"data-dsh-jump-mode":n},t.createElement("div",{"data-dsh-jump-text":""},t.createElement("span",{"data-dsh-jump-title":""},o),t.createElement("p",{"data-dsh-jump-description":""},d?s.recordingHint:a)),t.createElement("div",{"data-dsh-jump-actions":""},t.createElement("button",{type:"button","data-dsh-jump-chord":n,"data-recording":d?"":void 0,"aria-label":c,...u===null?{}:{"aria-keyshortcuts":u},onClick:()=>{r.begin(n)}},d?s.recording:u??s.referenceDisabled),m?t.createElement("button",{type:"button","data-dsh-jump-disable":n,disabled:p===null,onClick:()=>{r.disableAction(n)}},s.referenceDisable):null,t.createElement("button",{type:"button","data-dsh-jump-reset":n,disabled:u===b,onClick:()=>{r.resetAction(n)}},s.reset)))}function ie(e){let{React:t,controller:n,platform:r,copy:i}=e,s=t.useSyncExternalStore(o=>n.subscribe(()=>o()),()=>n.getState());return te(t,s.recording,o=>{n.press({key:o.key,metaKey:o.metaKey,ctrlKey:o.ctrlKey,altKey:o.altKey,shiftKey:o.shiftKey,isComposing:o.isComposing})}),t.createElement("div",{"data-dsh-jump-page":""},t.createElement("div",{"data-dsh-jump-head":""},t.createElement("h3",{"data-dsh-jump-heading":""},i.title),t.createElement("p",{"data-dsh-jump-lede":""},i.description)),O({React:t,action:"click",controller:n,platform:r,copy:i,title:i.clickTitle,description:i.clickDescription,name:i.clickName}),O({React:t,action:"focus",controller:n,platform:r,copy:i,title:i.focusTitle,description:i.focusDescription,name:i.focusName}),O({React:t,action:"reference",controller:n,platform:r,copy:i,title:i.referenceTitle,description:i.referenceDescription,name:i.referenceName}),s.issue===null?null:t.createElement("p",{"data-dsh-jump-issue":"",role:"status"},i.issues[s.issue]),t.createElement("p",{"data-dsh-jump-note":""},i.bareNote))}var N="dsh-jump:bindings:v1";function Ve(e,t){return v(e.click,t.click)&&v(e.focus,t.focus)&&v(e.reference,t.reference)}function qe(){try{return globalThis.localStorage??null}catch{return null}}function oe(e){let t=R(e.platform),n=e.storage===void 0?qe():e.storage,r=new Set,i=()=>{if(n===null)return t;try{let a=n.getItem(N);return a===null?t:j(JSON.parse(a),e.platform)}catch{return t}},s=i(),o=a=>{if(!Ve(s,a)){s=a;for(let c of r)c(s)}};return{get:()=>s,set(a){if(o(j(a,e.platform)),n!==null)try{n.setItem(N,JSON.stringify(s))}catch{}},reset(){if(o(t),n!==null)try{n.removeItem(N)}catch{}},reload(){o(i())},subscribe(a){return r.add(a),()=>{r.delete(a)}}}}var se="lionad.jump";var Xe=/^(?:css-|sc-|jsx-|_|svelte-|emotion-)/u,Ze=new Set(["flex","grid","block","inline","hidden","relative","absolute","static","sticky","fixed","container","row","col","wrap","grow","shrink","truncate","sr-only","active","disabled","selected","focused","open","closed"]);function Qe(e){return e===""||Ze.has(e)||Xe.test(e)?!1:e.includes("-")||e.includes("_")}function et(e){let t=e.replace(/\s+/gu," ").trim();return t.length<=80?t:`${t.slice(0,79).trimEnd()}\u2026`}function ae(e){let t=e.tagName.toLowerCase(),n=e.getAttribute("id")?.trim()??"",r=e.getAttribute("data-testid")?.trim()??"",i=e.getAttribute("role")?.trim()??"",s=e.getAttribute("aria-label")?.trim()??"",o=Array.from(e.classList).filter(Qe).slice(0,3),a=et(e.textContent??"");return{kind:"ui.element",tag:t,...n===""?{}:{id:n},...r===""?{}:{testId:r},...o.length===0?{}:{classes:o},...i===""?{}:{role:i},...s===""?{}:{ariaLabel:s},...a===""?{}:{text:a}}}function ce(e){return e.testId!==void 0?`${e.tag}[data-testid=${e.testId}]`:e.id!==void 0?`${e.tag}#${e.id}`:e.tag}function tt(e){return e.ariaLabel!==void 0?e.ariaLabel:e.text!==void 0?e.text:e.classes?.[0]}function le(e){let t=[`[ui element] <${e.tag}>`];return e.testId!==void 0&&t.push(`data-testid="${e.testId}"`),e.id!==void 0&&t.push(`id="${e.id}"`),e.role!==void 0&&t.push(`role=${e.role}`),e.ariaLabel!==void 0&&t.push(`aria-label="${e.ariaLabel}"`),e.classes!==void 0&&e.classes.length>0&&t.push(`class="${e.classes.join(" ")}"`),e.text!==void 0&&t.push(`text="${e.text}"`),t.join(" ")}function ue(e){let t=ce(e),n=tt(e);return{kind:"ui.element",id:t,label:n===void 0?e.tag:`${e.tag}\u300C${n}\u300D`,clipboardText:`[ui element ${t}]`,modelText:le(e),ref:JSON.stringify(e)}}function de(e){let t;try{t=JSON.parse(e)}catch{return}if(t===null||typeof t!="object")return;let n=t;if(!(typeof n.tag!="string"||n.tag===""))return{kind:"ui.element",tag:n.tag,...typeof n.id=="string"?{id:n.id}:{},...typeof n.testId=="string"?{testId:n.testId}:{},...Array.isArray(n.classes)?{classes:n.classes.filter(r=>typeof r=="string")}:{},...typeof n.role=="string"?{role:n.role}:{},...typeof n.ariaLabel=="string"?{ariaLabel:n.ariaLabel}:{},...typeof n.text=="string"?{text:n.text}:{}}}function nt(e){let t=de(e);return t===void 0?`[ui element ${e}]`:`[ui element ${ce(t)}]`}function rt(e){let t=de(e);return t===void 0?`[ui element ${e}]`:le(t)}function pe(e,t){let n={source:se,ref:t.ref,label:t.label,clipboardText:t.clipboardText,appearance:"session"},r=e.captureSpan();if(r!==void 0){if(e.insertReference(n,r))return"reference";let s=e.captureSpan();if(s!==void 0&&e.insertReference(n,s))return"reference"}let i=e.captureSpan();return i===void 0?"failed":e.insertText(t.clipboardText,i)?"text":"failed"}function fe(e,t){return function(r){let i=r??{},s=i.sessionId??null,o=i.inputActions??null,a=e.useRef({sessionId:s,inputActions:o});a.current={sessionId:s,inputActions:o};let c=o!==null;return e.useEffect(()=>{t({sessionId:s,inputActions:a.current.inputActions})},[s,c]),null}}function me(){return{trigger:"@",name:se,showGroupTitle:!1,async candidates(){return[]},onPick(){},codec:{clipboardText:nt,async serialize(e){return rt(e)}}}}var ge="settings.section",it="jump",ot=25,ye="conversation.input.overlay",st="jump.session-bridge",at=95;function he(e){let{ctx:t,platform:n,React:r,config:i}=e,s=e.store??oe({platform:n}),o={state:{sessionId:null,inputActions:null}},a=d=>{let{sessionId:p,inputActions:u}=o.state;if(p===null||u===null)return"no-session";let f;try{let m=t.get("sessions"),g=t.get("conversation"),k=m?.scope?.(p);if(k===void 0||g?.input?.for===void 0)return"no-session";f=g.input.for(k)}catch{return"no-session"}if(f==null)return"no-session";let b=pe({captureSpan:()=>u.captureInsertion?.(),insertReference:(m,g)=>f?.insertReference?.(m,g)??!1,insertText:(m,g)=>u.insertText?.(m,g)??!1},ue(ae(d)));return(b==="reference"||b==="text")&&f.focus?.(),b},c=Z({config:i,bindings:s,platform:n,window:e.window,onReference:d=>{a(d)}}),l=[c.apply()];return typeof t.inject=="function"&&l.push(t.inject(["inputTriggers"],d=>{let p=d.get("inputTriggers");if(p===void 0)return;let u=p.registerSource(me());return()=>u()})),r!==null&&l.push(t.inject(["slots"],d=>{let p=d.get("slots");if(p===void 0)return;let u=d.get("locale"),f=ee({store:s,platform:n}),b=()=>_(u?.getSnapshot().active??"zh").navLabel,m=()=>ie({React:r,controller:f,platform:n,copy:_(u?.getSnapshot().active??"zh")}),g=p.inject(ge,()=>p.register({name:ge,id:it,order:ot,label:b},m)),k=fe(r,J=>{o.state=J}),x=p.inject(ye,()=>p.register({name:ye,id:st,order:at},k)),T=e.document??globalThis.document,y=T===void 0?void 0:re(T);return()=>{g(),x(),y?.()}})),{store:s,app:c,dispose(){for(;l.length>0;)l.pop()?.()}}}var M=null;function ct(){return C(globalThis.navigator?.platform??"")}function lt(){if(M===null)return null;let e=M("react");for(let t of["createElement","useEffect","useRef","useSyncExternalStore"])if(typeof e?.[t]!="function")return null;return e}var be={name:"dsh-jump",inject:[],apply(e,t){let n=he({ctx:e,platform:ct(),React:lt(),config:t});return()=>n.dispose()}};function ut(e){M=e}var dt=be;

module.exports.boot(require);
    return module.exports.default ?? module.exports;
  }
});
