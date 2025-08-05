CREATE OR REPLACE TRIGGER TRG_IMPEDE_DUPLICADO_CODARM
BEFORE INSERT ON AD_PERMEND
FOR EACH ROW
DECLARE
  v_count NUMBER;
BEGIN
  -- Verifica se já existe um registro com o mesmo CODARM
  SELECT COUNT(1)
  INTO v_count
  FROM AD_PERMEND
  WHERE CODARM = :NEW.CODARM;

  -- Se o contador for maior que zero, dispara o erro
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'O Armazén ' || :NEW.CODARM || ' já existe na tabela AD_PERMEND.');
  END IF;
END;
