import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useResource } from "../../hooks/useResource";
import { Button, Copy, Field, Pager, ResourceState, colors, radius, shadows, styles, useBento } from "./index";

type SelectItem = { id: string | number; name?: string } & Record<string, unknown>;

function appendQuery(basePath: string, queryValues: Record<string, string | number | undefined>) {
  const [pathname, searchStr] = basePath.split("?");
  const params = new URLSearchParams(searchStr || "");
  Object.entries(queryValues).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

// Modal/Bottom-Sheet searchable selector for large/paginated resources.
// Always displays human-readable names (never raw IDs or UUIDs).
export function Select<Item extends SelectItem = SelectItem>({
  label,
  path,
  values,
  onChange,
  multiple = false,
  disabled = false,
  searchable = true,
  itemLabel = (item) => item.name ?? String(item.id),
}: {
  label: string;
  path: string | null;
  values: string[];
  onChange(values: string[]): void;
  multiple?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  itemLabel?(item: Item): string;
}) {
  const { mobile } = useBento();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [attemptedIds, setAttemptedIds] = useState<Record<string, boolean>>({});

  const needsResolution =
    Boolean(path) &&
    !disabled &&
    values.some((id) => !selectedLabels[String(id)] && !attemptedIds[String(id)]);

  const resource = useResource<Item[]>(
    (open || needsResolution) && path ? appendQuery(path, { page, q: debouncedSearch.trim() }) : null,
  );

  useEffect(() => {
    const items = resource.result?.data;
    if (!items) return;
    setSelectedLabels((prev) => {
      const next = { ...prev };
      for (const item of items) {
        next[String(item.id)] = itemLabel(item);
      }
      return next;
    });
    setAttemptedIds((prev) => {
      const next = { ...prev };
      for (const id of values) {
        next[String(id)] = true;
      }
      return next;
    });
  }, [resource.result?.data, values]);

  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggle(item: Item) {
    const id = String(item.id);
    const name = itemLabel(item);
    setSelectedLabels((prev) => ({ ...prev, [id]: name }));
    if (!multiple) {
      onChange([id]);
      setOpen(false);
      return;
    }
    onChange(
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  }

  const selectedNames = values.map((id) => selectedLabels[String(id)]).filter(Boolean);
  const displayTitle =
    values.length === 0
      ? label
      : selectedNames.length > 0
        ? `${label}: ${selectedNames.join(", ")}`
        : `${label}: ${values.length} ${values.length === 1 ? "seleccionado" : "seleccionados"}`;

  return (
    <View style={{ gap: 8, minWidth: 0, maxWidth: "100%" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || !path, expanded: open }}
        disabled={disabled || !path}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => ({
          minHeight: 48,
          maxWidth: "100%",
          flexShrink: 1,
          alignSelf: "flex-start",
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: values.length > 0 ? colors.accentBorder : colors.borderStrong,
          backgroundColor: pressed ? colors.secondaryHover : colors.secondary,
          opacity: disabled || !path ? 0.55 : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        })}
      >
        <Text
          numberOfLines={2}
          style={{
            color: values.length > 0 ? colors.accentText : colors.onSecondary,
            fontSize: 14,
            fontWeight: values.length > 0 ? "700" : "600",
            flexShrink: 1,
          }}
        >
          {displayTitle}
        </Text>
        <Text aria-hidden style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>
          ▾
        </Text>
      </Pressable>

      {open && Boolean(path) && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(10, 10, 12, 0.72)",
              justifyContent: mobile ? "flex-end" : "center",
              alignItems: "center",
              padding: mobile ? 0 : 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: mobile ? "100%" : 560,
                maxHeight: mobile ? "85%" : "80%",
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                borderBottomLeftRadius: mobile ? 0 : radius.xl,
                borderBottomRightRadius: mobile ? 0 : radius.xl,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                padding: mobile ? 16 : 22,
                gap: 12,
                boxShadow: shadows.card,
              }}
            >
              <View style={styles.between}>
                <Copy size="subheading" weight="700">
                  {label}
                </Copy>
                <View style={styles.row}>
                  <Button
                    title={multiple ? "Todas / Limpiar" : "Todas"}
                    secondary={values.length > 0}
                    onPress={() => {
                      onChange([]);
                      if (!multiple) setOpen(false);
                    }}
                  />
                  <Button title="Listo" secondary onPress={() => setOpen(false)} />
                </View>
              </View>

              {searchable && (
                <Field
                  label={`Buscar ${label.toLowerCase()}`}
                  value={search}
                  onChangeText={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                />
              )}

              <ScrollView
                style={{ maxHeight: mobile ? 340 : 380 }}
                contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                keyboardShouldPersistTaps="handled"
              >
                <ResourceState
                  {...resource}
                  empty={!resource.result?.data.length}
                  retry={() => void resource.reload()}
                />
                <View style={styles.row}>
                  {resource.result?.data.map((item) => {
                    const id = String(item.id);
                    const selected = values.includes(id);
                    return (
                      <Button
                        key={id}
                        title={`${selected ? "✓ " : ""}${itemLabel(item)}`}
                        secondary={!selected}
                        onPress={() => toggle(item)}
                      />
                    );
                  })}
                </View>
              </ScrollView>

              <Pager pagination={resource.result?.pagination} onPage={setPage} />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
