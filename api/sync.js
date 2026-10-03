const today=require('./today');

module.exports=async function handler(req,res){
  let payload;
  const proxy={
    setHeader:(...args)=>res.setHeader(...args),
    status:(code)=>({json:(body)=>{payload={code,body}; return body;}})
  };
  await today(req,proxy);
  const ok=payload && payload.code===200;
  res.status(ok?200:502).json({ok,ranAt:new Date().toISOString(),upstream:payload?.body||null});
};