import { useState } from "react";
import { View } from "react-native";
import { useResource } from "../../hooks/useResource";
import { query } from "../../services/http";
import type { Named } from "../../types/api";
import { Button, Copy, Field, Pager, ResourceState, styles } from "./index";
export function Select({
  label,
  path,
  values,
  onChange,
  multiple = false,
}: {
  label: string;
  path: string;
  values: string[];
  onChange(values: string[]): void;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<Named[]>(
    open
      ? path +
          (path === "/concert-types"
            ? ""
            : query({ q: search.trim(), page, limit: 10 }))
      : null,
  );
  return (
    <View style={{ gap: 10 }}>
      <Button
        title={`${label}${values.length ? ` (${values.join(", ")})` : ""}`}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          {path !== "/concert-types" && (
            <Field
              label={`Buscar ${label.toLowerCase()}`}
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
          )}
          <ResourceState
            {...resource}
            empty={resource.result?.data.length === 0}
            retry={() => void resource.reload()}
          />
          <View style={styles.row}>
            <Button title="Limpiar" secondary onPress={() => onChange([])} />
            {resource.result?.data.map((item) => (
              <Button
                key={item.id}
                title={`${values.includes(item.id) ? "✓ " : ""}${item.name ?? item.code}`}
                secondary={!values.includes(item.id)}
                onPress={() => {
                  onChange(
                    multiple
                      ? values.includes(item.id)
                        ? values.filter((id) => id !== item.id)
                        : [...values, item.id]
                      : [item.id],
                  );
                  if (!multiple) setOpen(false);
                }}
              />
            ))}
          </View>
          <Pager pagination={resource.result?.pagination} onPage={setPage} />
          {multiple && (
            <Copy muted>
              El orden de selección define el orden de los artistas.
            </Copy>
          )}
        </>
      )}
    </View>
  );
}
