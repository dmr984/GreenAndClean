"use client";

import * as React from "react";
import { PlusCircle, MoreHorizontal, File, ListFilter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import placeholder from '@/lib/placeholder-images.json';
import { Input } from "@/components/ui/input";

const users = [
  {
    id: "USR001",
    name: "Mario Rossi",
    email: "mario.rossi@example.com",
    role: "Operatore",
    status: "Attivo",
    lastLogin: "2024-07-29 08:15",
  },
  {
    id: "USR002",
    name: "Anna Bianchi",
    email: "anna.bianchi@example.com",
    role: "Operatore",
    status: "Attivo",
    lastLogin: "2024-07-29 08:05",
  },
  {
    id: "USR003",
    name: "Luca Verdi",
    email: "luca.verdi@example.com",
    role: "Operatore",
    status: "Inattivo",
    lastLogin: "2024-07-25 17:30",
  },
  {
    id: "USR004",
    name: "Giulia Neri",
    email: "giulia.neri@example.com",
    role: "Supervisore",
    status: "Attivo",
    lastLogin: "2024-07-29 09:00",
  },
  {
    id: "USR005",
    name: "Admin",
    email: "admin@workforce.hub",
    role: "Admin",
    status: "Attivo",
    lastLogin: "2024-07-29 09:30",
  },
];

export default function UsersPage() {
  const userAvatar = placeholder.placeholderImages.find(p => p.id === 'user-avatar');

  return (
    <Tabs defaultValue="all">
      <div className="flex items-center">
        <TabsList>
          <TabsTrigger value="all">Tutti</TabsTrigger>
          <TabsTrigger value="active">Attivi</TabsTrigger>
          <TabsTrigger value="inactive">Inattivi</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                  Filtra
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filtra per ruolo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked>
                Operatore
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Supervisore</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem>Admin</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-7 gap-1">
            <File className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Esporta
            </span>
          </Button>
          <Button size="sm" className="h-7 gap-1">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Aggiungi Utente
            </span>
          </Button>
        </div>
      </div>
      <TabsContent value="all">
        <Card>
          <CardHeader>
             <CardTitle>Utenti</CardTitle>
            <CardDescription>
              Gestisci gli utenti del sistema, visualizza i loro ruoli e lo stato.
            </CardDescription>
             <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Cerca utenti per nome o email..."
                  className="w-full appearance-none bg-background pl-8 shadow-none md:w-2/3 lg:w-1/3"
                />
              </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden w-[100px] sm:table-cell">
                    <span className="sr-only">Avatar</span>
                  </TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Ultimo Accesso</TableHead>
                  <TableHead>
                    <span className="sr-only">Azioni</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="hidden sm:table-cell">
                      <Avatar className="h-9 w-9">
                         {userAvatar && <AvatarImage src={userAvatar.imageUrl} alt="Avatar" />}
                        <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'Admin' ? 'destructive' : 'secondary'}>{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.status === 'Attivo' ? 'default' : 'outline'}>{user.status}</Badge>
                    </TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-haspopup="true" size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Apri menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Azioni</DropdownMenuLabel>
                          <DropdownMenuItem>Modifica</DropdownMenuItem>
                          <DropdownMenuItem>Disattiva</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
