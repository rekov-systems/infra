import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Settings2, Warehouse } from "lucide-react";
import { useInventoryCenters, InventoryCenter } from "@/hooks/useInventoryCenters";

export function InventoryCenters() {
  const { centers, isLoading, createCenter, updateCenter } = useInventoryCenters();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryCenter | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name") as string,
      type: formData.get("type") as string,
    };

    if (editing) {
      await updateCenter.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createCenter.mutateAsync(payload);
    }
    setOpen(false);
    setEditing(null);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando centros...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Centros de Inventario</h3>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Nuevo Centro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Centro" : "Nuevo Centro de Inventario"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre del Centro</Label>
                <Input id="name" name="name" defaultValue={editing?.name} placeholder="Ej: Bodega 2, Barra Principal" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select name="type" defaultValue={editing?.type || "warehouse"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Bodega (Almacén)</SelectItem>
                    <SelectItem value="point_of_sale">Punto de Venta</SelectItem>
                    <SelectItem value="bar">Barra</SelectItem>
                    <SelectItem value="kitchen">Cocina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createCenter.isPending || updateCenter.isPending}>
                {editing ? "Guardar Cambios" : "Crear Centro"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centers.map((center) => (
              <TableRow key={center.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  {center.name}
                </TableCell>
                <TableCell className="capitalize">{center.type.replace("_", " ")}</TableCell>
                <TableCell>
                  <Badge variant={center.status === "active" ? "default" : "secondary"} className={center.status === "active" ? "bg-success text-success-foreground" : ""}>
                    {center.status === "active" ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(center); setOpen(true); }}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
