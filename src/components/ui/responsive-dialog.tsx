"use client"
 
import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useMediaQuery } from "@/hooks/use-media-query"
 
const ResponsiveDialog = ({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const DialogComponent = isDesktop ? Dialog : Drawer
 
  return <DialogComponent {...props}>{children}</DialogComponent>
}
 
const ResponsiveDialogTrigger = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogTrigger>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const TriggerComponent = isDesktop ? DialogTrigger : DrawerTrigger
 
  return <TriggerComponent {...props}>{children}</TriggerComponent>
}
 
const ResponsiveDialogClose = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogClose>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const CloseComponent = isDesktop ? DialogClose : DrawerClose
 
  return <CloseComponent {...props}>{children}</CloseComponent>
}
 
const ResponsiveDialogContent = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogContent>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
 
  if (isDesktop) {
    return <DialogContent {...props}>{children}</DialogContent>
  }
 
  return (
    <DrawerContent {...props}>
        <div className="mx-auto w-full max-w-sm">{children}</div>
    </DrawerContent>
  )
}
 
const ResponsiveDialogHeader = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const HeaderComponent = isDesktop ? DialogHeader : DrawerHeader
 
  return <HeaderComponent {...props} className={className}>{children}</HeaderComponent>
}
 
const ResponsiveDialogFooter = ({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const FooterComponent = isDesktop ? DialogFooter : DrawerFooter
 
  return <FooterComponent {...props} className={className}>{children}</FooterComponent>
}
 
const ResponsiveDialogTitle = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogTitle>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const TitleComponent = isDesktop ? DialogTitle : DrawerTitle
 
  return <TitleComponent {...props}>{children}</TitleComponent>
}
 
const ResponsiveDialogDescription = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogDescription>) => {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const DescriptionComponent = isDesktop ? DialogDescription : DrawerDescription
 
  return <DescriptionComponent {...props}>{children}</DescriptionComponent>
}
 
export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
