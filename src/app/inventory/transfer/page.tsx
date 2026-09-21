'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function TransferIndex(){
  const router=useRouter();
  useEffect(()=>{ router.replace('/inventory/transfer/requisition'); },[router]);
  return null;
}
