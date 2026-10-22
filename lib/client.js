window.__ModuleLoader__.load({
  id: "dsh-jump",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var i=Object.defineProperty;var C=Object.getOwnPropertyDescriptor;var l=Object.getOwnPropertyNames;var p=Object.prototype.hasOwnProperty;var s=(t,e)=>{for(var n in e)i(t,n,{get:e[n],enumerable:!0})},x=(t,e,n,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of l(e))!p.call(t,o)&&o!==n&&i(t,o,{get:()=>e[o],enumerable:!(r=C(e,o))||r.enumerable});return t};var u=t=>x(i({},"__esModule",{value:!0}),t);var I={};s(I,{clientPlugin:()=>c,default:()=>g});module.exports=u(I);var a={activationClick:"h",activationFocus:"u",candidateSelector:"a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], [tabindex]",extraSelector:""};var c={name:"dsh-jump",inject:[],apply(t){}},g=c;

    return module.exports.default ?? module.exports;
  }
});
