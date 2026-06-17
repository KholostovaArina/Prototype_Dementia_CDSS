-- CDSS Dementia — новая схема (пересоздание БД)
-- Database: cdss_dementia (или ваша)
-- Schema:   cdss

CREATE SCHEMA IF NOT EXISTS cdss;

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.patients (
  id                    integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  fio                   text NOT NULL,
  birth_year            integer,
  is_female             integer NOT NULL DEFAULT 0
    CONSTRAINT patients_is_female_chk CHECK (is_female IN (0, 1)),
  education_level       integer
    CONSTRAINT patients_education_level_chk CHECK (education_level IS NULL OR education_level BETWEEN 0 AND 9),
  is_heredity_cognitive integer NOT NULL DEFAULT 0
    CONSTRAINT patients_is_heredity_cognitive_chk CHECK (is_heredity_cognitive IN (0, 1)),
  ambulatory_card_no    text,
  is_archived           integer NOT NULL DEFAULT 0
    CONSTRAINT patients_is_archived_chk CHECK (is_archived IN (0, 1)),
  CONSTRAINT patients_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE cdss.patients IS 'Пациент';
COMMENT ON COLUMN cdss.patients.is_female IS '0 — мужской, 1 — женский';
COMMENT ON COLUMN cdss.patients.education_level IS 'Код уровня образования (справочник — задать в приложении)';
COMMENT ON COLUMN cdss.patients.is_heredity_cognitive IS '0 — нет, 1 — наследственная отягощённость по КН';
COMMENT ON COLUMN cdss.patients.ambulatory_card_no IS 'Номер амбулаторной карты (n_amb_karta)';
COMMENT ON COLUMN cdss.patients.is_archived IS '0 — активный, 1 — в архиве';

-- ---------------------------------------------------------------------------
-- visits
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.visits (
  id                              integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  patient_id                      integer NOT NULL,
  visit_date                      date NOT NULL,
  doctor                          text,
  visit_number                    integer NOT NULL DEFAULT 1,

  diagnosis_main                  integer,
  diagnosis_features              integer,
  diagnosis_referral              integer
    CONSTRAINT visits_diagnosis_referral_chk CHECK (diagnosis_referral IS NULL OR diagnosis_referral BETWEEN 0 AND 7),
  severity                        integer
    CONSTRAINT visits_severity_chk CHECK (severity IS NULL OR severity BETWEEN 0 AND 6),
  ukn_type                        integer
    CONSTRAINT visits_ukn_type_chk CHECK (ukn_type IS NULL OR ukn_type BETWEEN 1 AND 4),
  disease_course                  integer
    CONSTRAINT visits_disease_course_chk CHECK (disease_course IS NULL OR disease_course BETWEEN 0 AND 3),
  dynamics                        integer
    CONSTRAINT visits_dynamics_chk CHECK (dynamics IS NULL OR dynamics BETWEEN 0 AND 3),

  disease_duration_months         integer,
  observation_duration_months     integer,
  behavior_disorders              integer
    CONSTRAINT visits_behavior_disorders_chk CHECK (behavior_disorders IS NULL OR behavior_disorders BETWEEN 0 AND 3),

  is_myocardial_infarction         integer NOT NULL DEFAULT 0
    CONSTRAINT visits_is_mi_chk CHECK (is_myocardial_infarction IN (0, 1)),
  comorbidity_hf                  integer
    CONSTRAINT visits_comorbidity_hf_chk CHECK (comorbidity_hf IS NULL OR comorbidity_hf BETWEEN 0 AND 3),
  comorbidity_diabetes            integer
    CONSTRAINT visits_comorbidity_diabetes_chk CHECK (comorbidity_diabetes IS NULL OR comorbidity_diabetes BETWEEN 0 AND 3),
  comorbidity_hypertension        integer
    CONSTRAINT visits_comorbidity_hypertension_chk CHECK (comorbidity_hypertension IS NULL OR comorbidity_hypertension BETWEEN 0 AND 3),
  comorbidity_stroke              integer
    CONSTRAINT visits_comorbidity_stroke_chk CHECK (comorbidity_stroke IS NULL OR comorbidity_stroke BETWEEN 0 AND 3),
  comorbidity_smoking             integer
    CONSTRAINT visits_comorbidity_smoking_chk CHECK (comorbidity_smoking IS NULL OR comorbidity_smoking BETWEEN 0 AND 2),
  comorbidity_alcohol             integer
    CONSTRAINT visits_comorbidity_alcohol_chk CHECK (comorbidity_alcohol IS NULL OR comorbidity_alcohol BETWEEN 0 AND 3),
  comorbidity_ulcer               integer
    CONSTRAINT visits_comorbidity_ulcer_chk CHECK (comorbidity_ulcer IS NULL OR comorbidity_ulcer BETWEEN 0 AND 3),
  comorbidity_onco                integer
    CONSTRAINT visits_comorbidity_onco_chk CHECK (comorbidity_onco IS NULL OR comorbidity_onco BETWEEN 0 AND 3),
  comorbidity_thyroid             integer
    CONSTRAINT visits_comorbidity_thyroid_chk CHECK (comorbidity_thyroid IS NULL OR comorbidity_thyroid BETWEEN 0 AND 3),
  comorbidity_neuro               integer
    CONSTRAINT visits_comorbidity_neuro_chk CHECK (comorbidity_neuro IS NULL OR comorbidity_neuro BETWEEN 0 AND 3),

  hachinski_score                   integer
    CONSTRAINT visits_hachinski_score_chk CHECK (hachinski_score IS NULL OR hachinski_score BETWEEN 0 AND 18),

  notes                           text,

  treatment_anamnesis               integer
    CONSTRAINT visits_treatment_anamnesis_chk CHECK (treatment_anamnesis IS NULL OR treatment_anamnesis BETWEEN 0 AND 2),
  treatment_main                    integer
    CONSTRAINT visits_treatment_main_chk CHECK (treatment_main IS NULL OR treatment_main BETWEEN 0 AND 5),
  treatment_additional_anamnesis    integer
    CONSTRAINT visits_treatment_additional_anamnesis_chk CHECK (treatment_additional_anamnesis IS NULL OR treatment_additional_anamnesis BETWEEN 0 AND 5),
  treatment_duration_months         integer,
  treatment_tolerance               integer
    CONSTRAINT visits_treatment_tolerance_chk CHECK (treatment_tolerance IS NULL OR treatment_tolerance BETWEEN 0 AND 3),
  treatment_changes                 integer
    CONSTRAINT visits_treatment_changes_chk CHECK (treatment_changes IS NULL OR treatment_changes BETWEEN 0 AND 3),
  treatment_additional              integer
    CONSTRAINT visits_treatment_additional_chk CHECK (treatment_additional IS NULL OR treatment_additional BETWEEN 0 AND 5),

  CONSTRAINT visits_pkey PRIMARY KEY (id),
  CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES cdss.patients (id)
);

COMMENT ON TABLE cdss.visits IS 'Визит / осмотр';
COMMENT ON COLUMN cdss.visits.notes IS 'Комментарий врача к визиту';
COMMENT ON COLUMN cdss.visits.diagnosis_referral IS '0 самотек, 1 КН, 2 БА, 3 сосудистая, 4 смешанная, 5 лобная, 6 ДТЛ, 7 другое';
COMMENT ON COLUMN cdss.visits.comorbidity_hf IS 'Тяжесть сердечных нарушений (tyazh_serd), не инфаркт';
COMMENT ON COLUMN cdss.visits.is_myocardial_infarction IS 'Инфаркт миокарда: 0 нет, 1 есть';

CREATE INDEX visits_patient_id_idx ON cdss.visits (patient_id);
CREATE INDEX visits_visit_date_idx ON cdss.visits (visit_date);

-- ---------------------------------------------------------------------------
-- mri
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.mri (
  id                          integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id                    integer NOT NULL,

  is_mri_done                 integer NOT NULL DEFAULT 0
    CONSTRAINT mri_is_mri_done_chk CHECK (is_mri_done IN (0, 1)),
  is_ct_done                  integer NOT NULL DEFAULT 0
    CONSTRAINT mri_is_ct_done_chk CHECK (is_ct_done IN (0, 1)),

  periventricular_leukoaraiosis integer NOT NULL DEFAULT 0
    CONSTRAINT mri_periventricular_chk CHECK (periventricular_leukoaraiosis BETWEEN 0 AND 3),
  subcortical_leukoaraiosis   integer NOT NULL DEFAULT 0
    CONSTRAINT mri_subcortical_chk CHECK (subcortical_leukoaraiosis BETWEEN 0 AND 3),
  external_atrophy            integer NOT NULL DEFAULT 0
    CONSTRAINT mri_external_atrophy_chk CHECK (external_atrophy BETWEEN 0 AND 3),
  internal_atrophy            integer NOT NULL DEFAULT 0
    CONSTRAINT mri_internal_atrophy_chk CHECK (internal_atrophy BETWEEN 0 AND 3),
  post_stroke_cysts           integer NOT NULL DEFAULT 0
    CONSTRAINT mri_post_stroke_cysts_chk CHECK (post_stroke_cysts BETWEEN 0 AND 3),

  fazekas                     integer NOT NULL DEFAULT 0
    CONSTRAINT mri_fazekas_chk CHECK (fazekas BETWEEN 0 AND 3),
  gca                         integer NOT NULL DEFAULT 0
    CONSTRAINT mri_gca_chk CHECK (gca BETWEEN 0 AND 3),
  hippocampus_atrophy         integer NOT NULL DEFAULT 0
    CONSTRAINT mri_hippocampus_atrophy_chk CHECK (hippocampus_atrophy BETWEEN 0 AND 3),
  focal_atrophy               integer NOT NULL DEFAULT 0
    CONSTRAINT mri_focal_atrophy_chk CHECK (focal_atrophy BETWEEN 0 AND 3),

  CONSTRAINT mri_pkey PRIMARY KEY (id),
  CONSTRAINT mri_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES cdss.visits (id),
  CONSTRAINT mri_visit_id_unique UNIQUE (visit_id)
);

COMMENT ON TABLE cdss.mri IS 'МРТ/КТ на визит (одна строка на визит)';

-- ---------------------------------------------------------------------------
-- csf_biomarkers
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.csf_biomarkers (
  id                          integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id                    integer NOT NULL,

  beta_amyloid                real,
  total_tau                   real,
  phospho_tau                 real,
  tau_amyloid_ratio           real,
  phospho_tau_amyloid_ratio   real,

  CONSTRAINT csf_biomarkers_pkey PRIMARY KEY (id),
  CONSTRAINT csf_biomarkers_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES cdss.visits (id),
  CONSTRAINT csf_biomarkers_visit_id_unique UNIQUE (visit_id)
);

COMMENT ON TABLE cdss.csf_biomarkers IS 'Биомаркеры СМЖ (все поля необязательны)';

-- ---------------------------------------------------------------------------
-- neurological_status (EAV)
-- finding_code: neuro_mimic … neuro_counter_resistance (28 полей формы)
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.neurological_status (
  id              integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id        integer NOT NULL,
  finding_code    text NOT NULL,
  severity_value  integer NOT NULL DEFAULT 0
    CONSTRAINT neurological_status_severity_chk CHECK (severity_value BETWEEN 0 AND 3),

  CONSTRAINT neurological_status_pkey PRIMARY KEY (id),
  CONSTRAINT neurological_status_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES cdss.visits (id),
  CONSTRAINT neurological_status_visit_finding_unique UNIQUE (visit_id, finding_code)
);

COMMENT ON TABLE cdss.neurological_status IS 'Неврологический статус: код finding_code + степень 0–3';
COMMENT ON COLUMN cdss.neurological_status.finding_code IS
  'neuro_mimic, neuro_gaze, neuro_tongue, neuro_oral_reflexes, neuro_pseudobulbar, neuro_bulbar, '
  'neuro_pyramidal, neuro_parkinsonism, neuro_chorea, neuro_myoclonus, neuro_other_hyperkinesis, '
  'neuro_postural_tremor, neuro_intention_tremor, neuro_rest_tremor, neuro_deep_sensitivity, '
  'neuro_surface_sensitivity, neuro_polyneuropathy, neuro_postural_disorder, neuro_falls, '
  'neuro_cerebellar_ataxia, neuro_sensitive_ataxia, neuro_vestibular_ataxia, neuro_frontal_ataxia, '
  'neuro_functional_ataxia, neuro_grasp_reflex, neuro_pelvic_disorder, neuro_pelvic_type, neuro_counter_resistance';

CREATE INDEX neurological_status_visit_id_idx ON cdss.neurological_status (visit_id);

-- ---------------------------------------------------------------------------
-- test_results (EAV, test_code — латиница)
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.test_results (
  id          integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id    integer NOT NULL,
  test_code   text NOT NULL,
  score       real,

  CONSTRAINT test_results_pkey PRIMARY KEY (id),
  CONSTRAINT test_results_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES cdss.visits (id),
  CONSTRAINT test_results_visit_test_unique UNIQUE (visit_id, test_code)
);

COMMENT ON TABLE cdss.test_results IS 'Нейропсихологические тесты; без schulte';
COMMENT ON COLUMN cdss.test_results.test_code IS
  'MMSE: mmse_temporal_orientation, mmse_spatial_orientation, mmse_registration, mmse_attention, '
  'mmse_delayed_recall, mmse_naming, mmse_repetition, mmse_comprehension, mmse_reading, mmse_writing, '
  'mmse_constructive_praxis, mmse_total; '
  'Digit: digit_substitution, digit_substitution_correct; '
  'NPI: npi_delusions … npi_appetite, npi_total; и др. (clock, cube, fab_*, benton_total, …)';

CREATE INDEX test_results_visit_id_idx ON cdss.test_results (visit_id);

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
CREATE TABLE cdss.predictions (
  id                integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  visit_id          integer NOT NULL,

  overall_risk      integer,
  confidence        real,
  risk_category     text,
  recommendations   text,
  domains_json      jsonb,

  CONSTRAINT predictions_pkey PRIMARY KEY (id),
  CONSTRAINT predictions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES cdss.visits (id),
  CONSTRAINT predictions_visit_id_unique UNIQUE (visit_id)
);

COMMENT ON TABLE cdss.predictions IS 'Результат ML на визит';
COMMENT ON COLUMN cdss.predictions.domains_json IS
  'Домены когнитивных функций, напр. {"Память": 72.5, "Внимание": 81.0, ...} — доля сохранности %';
COMMENT ON COLUMN cdss.predictions.overall_risk IS 'Риск деменции, %';

CREATE INDEX predictions_visit_id_idx ON cdss.predictions (visit_id);
