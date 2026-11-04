'use client';

import {useId,useRef,useState,type ReactNode} from 'react';
import {Popover as PopoverPrimitive} from 'radix-ui';
import '@/app/presentation-info.css';

type InfoProps={title:string;children:ReactNode;className?:string};

/** A click-only explanation, isolated from the form label or chart containing it. */
export function InfoHint({title,children,className}:InfoProps){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),content=useRef<HTMLDivElement>(null),titleId=useId();
 return <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
  <PopoverPrimitive.Trigger asChild>
   <button ref={trigger} type="button" className={`presentation-info-trigger${className?` ${className}`:''}`} aria-label={`${title}：查看说明`} aria-haspopup="dialog" aria-expanded={open}
    onPointerDown={event=>event.stopPropagation()}
    onKeyDown={event=>event.stopPropagation()}
    onClick={event=>{event.preventDefault();event.stopPropagation();setOpen(value=>!value);}}>
    <span aria-hidden="true">!</span>
   </button>
  </PopoverPrimitive.Trigger>
  <PopoverPrimitive.Portal>
   <PopoverPrimitive.Content ref={content} className="presentation-info-popover" role="dialog" aria-modal="true" aria-labelledby={titleId} side="bottom" align="start" sideOffset={8} collisionPadding={12} avoidCollisions sticky="always"
    onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}
    onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation();}}
    onEscapeKeyDown={event=>{event.stopPropagation();const nested=content.current?.querySelector<HTMLDialogElement>('dialog[open]');if(nested){event.preventDefault();if(typeof nested.requestClose==='function')nested.requestClose();else{const cancel=new Event('cancel',{cancelable:true});nested.dispatchEvent(cancel);if(!cancel.defaultPrevented)nested.close();}}}}
    onCloseAutoFocus={event=>{event.preventDefault();if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});}}>
    <div className="presentation-info-heading">
     <h3 id={titleId}>{title}</h3>
     <PopoverPrimitive.Close asChild><button className="presentation-info-close" type="button" aria-label={`关闭${title}说明`} onClick={event=>event.stopPropagation()}><span aria-hidden="true">×</span></button></PopoverPrimitive.Close>
    </div>
    <div className="presentation-info-body">{children}</div>
    <PopoverPrimitive.Arrow className="presentation-info-arrow" width={12} height={6}/>
   </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
 </PopoverPrimitive.Root>;
}

/** The title is the short visible label; children supply the explanation. */
export function InfoLabel({title,children,className}:InfoProps){
 return <span className={`presentation-label${className?` ${className}`:''}`}>{title}<InfoHint title={title}>{children}</InfoHint></span>;
}

export default InfoHint;
