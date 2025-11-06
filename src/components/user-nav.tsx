'use client';
import { useRouter } from "next/navigation";
import React from 'react';
import { LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import placeholder from '@/lib/placeholder-images.json';

export function UserNav() {
  const router = useRouter();
  const userAvatar = placeholder.placeholderImages.find(p => p.id === 'user-avatar');
  const [userName, setUserName] = React.useState<string | null>(null);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const role = localStorage.getItem('userRole');
    const name = localStorage.getItem('userName');
    const id = localStorage.getItem('userId');
    setUserRole(role);
    setUserName(name);
    setUserId(id);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    router.push('/');
  }

  const getEmail = () => {
    if (userRole === 'admin') return 'admin@serveco.it';
    if (userName) return `${userName.toLowerCase().replace(' ', '.')}@serveco.it`;
    return 'utente@serveco.it';
  }

  const getAvatarFallback = () => {
     if (userName) {
        const parts = userName.split(' ');
        if (parts.length > 1) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return userName.substring(0, 2).toUpperCase();
     }
     return "U";
  }
  
  const handleProfileClick = () => {
    if (userRole === 'operator' && userId) {
      router.push(`/dashboard/users/${userId}`);
    } else if(userRole === 'admin') {
      // Admin doesn't have a profile page, maybe go to users list?
      router.push('/dashboard/users');
    }
  };


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt="@operator" />}
            <AvatarFallback>{getAvatarFallback()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{userName || 'Utente'}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {getEmail()}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleProfileClick} disabled={!userId && userRole === 'operator'}>
            <User className="mr-2 h-4 w-4" />
            <span>Profilo</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>Impostazioni</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Esci</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
