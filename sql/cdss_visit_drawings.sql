-- Фото рисуночных тестов (часы, куб, забор). Выполнить в Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS cdss.visit_drawings (
  id            integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id      integer NOT NULL,
  test_code     text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  storage_path  text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT visit_drawings_pkey PRIMARY KEY (id),
  CONSTRAINT visit_drawings_visit_id_fkey
    FOREIGN KEY (visit_id) REFERENCES cdss.visits (id) ON DELETE CASCADE,
  CONSTRAINT visit_drawings_visit_test_unique UNIQUE (visit_id, test_code),
  CONSTRAINT visit_drawings_test_code_chk CHECK (
    test_code IN ('clock_drawing', 'cube_copy', 'graphomotor_fence')
  )
);

COMMENT ON TABLE cdss.visit_drawings IS
  'Скан/фото листов рисуночных нейропсихологических проб';

CREATE INDEX IF NOT EXISTS visit_drawings_visit_id_idx
  ON cdss.visit_drawings (visit_id);
