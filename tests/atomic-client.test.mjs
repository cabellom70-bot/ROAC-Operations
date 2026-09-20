import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import assert from 'node:assert/strict';
const ast=ts.createSourceFile('App.tsx',fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return ts.transpile(found,{target:ts.ScriptTarget.ES2022});}
for(const [name,args,rpc] of [
['iniciarMantenimientoProgramado',[],'roac_iniciar_mantenimiento'],
['finalizarMantenimientoProgramado',[],'roac_finalizar_mantenimiento'],
['asignarBackup',['TEST'],'roac_asignar_backup'],
['tomarAveria',['Tecnico'],'roac_registrar_intervencion'],
['tomarContinuidadAveria',['Tecnico'],'roac_registrar_intervencion'],
['cerrarAveria',['Reparado'],'roac_cerrar_averia_atomica']]){
for(const mode of ['error','empty','success']){
 const alerts=[],writes=[],views=[];let calls=0;
 const ctx={console:{error(){},warn(){}},exigirPermiso:()=>true,alert:m=>alerts.push(m),
 equipoSeleccionado:{numeroMina:'TEST'},motivoMantenimiento:'Local',responsableMantenimiento:'Tecnico',trabajoMantenimiento:'Local',
 mantenimientoSeleccionado:{id:1,equipo:{numeroMina:'TEST'}},numeroBackup:null,
 equipos:[{numeroMina:'TEST',tipo:'CAEX',estado:'Operativo'}],averiaSeleccionadaId:1,
 averias:[{id:1,estadoAveria:'En atención',tomadaPor:'Anterior',equipo:{numeroMina:'TEST'}}],
 turnoActual:{claveTurno:'local'},obtenerAveriaAbierta:()=>null,obtenerMantenimientoActivo:()=>null,
 supabase:{from(){throw Error('Unexpected direct table write');},async rpc(actual){assert.equal(actual,rpc);calls++;return mode==='error'?{error:{message:'local'},data:null}:{error:null,data:mode==='empty'?null:rpc==='roac_asignar_backup'?true:rpc==='roac_registrar_intervencion'?'2026-09-20T12:00:00Z':1};}},
 canalBackupBroadcastRef:{current:null},canalAveriasBroadcastRef:{current:null},
 cargarAverias:async()=>{},cargarEquipos:async()=>{},cargarBackup:async()=>{},cargarMantenimientos:async()=>{},cargarIntervenciones:async()=>{},
 setNumeroBackup:()=>writes.push('backup'),setAverias:()=>writes.push('averias'),setEquipos:()=>writes.push('equipos'),
 setEquipoSeleccionado:()=>writes.push('seleccion'),setMotivoMantenimiento:()=>{},setResponsableMantenimiento:()=>{},setMantenimientoSeleccionadoId:()=>{},setTrabajoMantenimiento:()=>{},setAveriaSeleccionadaId:()=>{},
 setVista:v=>views.push(v),enviarPushOperacional:()=>{},
 };
 vm.createContext(ctx);vm.runInContext(extract(name),ctx);await ctx[name](...args);
 assert.equal(calls,1,name);
 if(mode!=='success'){assert.equal(alerts.length,1,name);assert.equal(writes.length,0,name);assert.equal(views.length,0,name);}
 else assert.equal(alerts.length,0,name);
}
}
const listeners={};let shown=0;const ctx={self:{addEventListener:(n,f)=>listeners[n]=f,registration:{showNotification:async()=>shown++}},clients:{matchAll:async()=>[{visibilityState:'visible'}]}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),ctx);let task;listeners.push({data:{json:()=>({title:'Prueba local'})},waitUntil:p=>task=p});await task;assert.equal(shown,1);
console.log('PASS: 18 casos del cliente (error, respuesta vacia y exito en 6 operaciones), mas push con ventana visible. Sin red.');
